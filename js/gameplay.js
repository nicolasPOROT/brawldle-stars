// ===============================
// CONFIG
// ===============================

const SUPABASE_URL = 'https://szvogkodnqqkkkzbiihd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo';

const MODE = {
  CLASSIC: 1,
  GADGET: 2,
  STAR_POWER: 3,
  SKIN: 4,
  HYPERCHARGE: 5,
  EMOJIS: 6,
  MYSTERY: 7,
  BUFFIE: 8,
  ICON: 9,
  DESCRIPTION: 10,
    TITLE: 11,
    SPRAY: 12,
};

const IMG_DEFAULT = '../assets/brawlers/default.png';
const RELEASE_ARROW = '../assets/design/arrow-icon.png';

const FIELDS = {
  BRAWLER: [
    'id',
    'name',
    'icon_path',
    'profile_icon_path',
    'gender',
    'rarity',
    'class',
    'attack_range',
    'movement',
    'release_year',
    'description',
    'emojis',
    'title',
    'prestige_title',
    'spray'
  ].join(','),

  ABILITY: [
    'id',
    'brawler_id',
    'type',
    'slot',
    'name',
    'image_path',
    'description'
  ].join(','),

  SKIN: [
    'id',
    'brawler_id',
    'name',
    'campaign',
    'rarity',
    'image_path'
  ].join(','),

  GAME_MODE: 'id,name,result_source,is_enabled,label',

  DAILY: 'result_id,mode_slot'
};

// ===============================
// STATE
// ===============================

const state = {
  page: null,

  mode: null,

  brawlers: [],
  target: null,

  guesses: new Set(),

  selected: null,

  attempts: 0,

  gameOver: false,

  clue: {
    active: null
  }
};

function finishGame() {
    state.gameOver = true;
    Utils.markModeCompleted(state.mode);
}

// ===============================
// SUPABASE
// ===============================

async function api(table, params = {}) {

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);

  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));

  const res = await fetch(url,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!res.ok){
    throw new Error(await res.text());
  }

  return res.json();

}

async function one(table,params){

  const rows=await api(table,{
    ...params,
    limit:'1'
  });

  if(!rows.length) throw new Error(`${table}: no result`);

  return rows[0];

}

// ===============================
// NORMALIZATION
// ===============================

const RANGE_MAP={
  "very short":"short",
  "short":"short",
  "medium":"normal",
  "normal":"normal",
  "long":"long",
  "very long":"very_long"
};

const MOVE_MAP={
  "very slow":"very_slow",
  "slow":"slow",
  "normal":"normal",
  "fast":"fast",
  "very fast":"very_fast"
};

function normalizeWord(v){
  return String(v||'')
    .trim()
    .toLowerCase()
    .replace(/\s+/g,'_');
}

function normalizeBrawler(r){

  return{

    id:+r.id,

    name:r.name,

    gender:normalizeWord(r.gender),

    rarity:normalizeWord(r.rarity),

    role:r.class,

    attack_range:RANGE_MAP[normalizeWord(r.attack_range).replace(/_/g,' ')]||normalizeWord(r.attack_range),

    movement:MOVE_MAP[normalizeWord(r.movement).replace(/_/g,' ')]||normalizeWord(r.movement),

    release_year:+r.release_year,

    icon_path:r.icon_path,

    profile_icon_path:r.profile_icon_path,

    description:r.description||'',

    emojis:r.emojis||'',

    title:r.title||'',

    prestige_title:r.prestige_title||'',

    spray:r.spray||''

  };

}

function pretty(v){

  return String(v)
    .replace(/_/g,' ')
    .replace(/\b\w/g,m=>m.toUpperCase());

}

// ===============================
// DATABASE
// ===============================

async function loadBrawlers(){

  const rows=await api('brawler',{
    select:FIELDS.BRAWLER,
    is_active:'eq.true',
    order:'name.asc'
  });

  return rows.map(normalizeBrawler);

}

async function loadMode(id){

  const mode=await one('game_mode',{
    select:FIELDS.GAME_MODE,
    [typeof id === 'number' ? 'id' : 'name']:`eq.${id}`
  });

  if(!mode.is_enabled)
    throw new Error('Mode disabled');

  return mode;

}

async function loadSchedule(mode){

  const today=new Date().toISOString().slice(0,10);

  return one('daily_schedule',{
    select:FIELDS.DAILY,
    play_date:`eq.${today}`,
    mode_id:`eq.${mode}`
  });

}

// ===============================
// TARGET LOADER
// ===============================

async function loadTarget(modeId){

  const mode=await loadMode(modeId);
  const schedule=await loadSchedule(mode.id);

  switch(mode.result_source){

    case 'brawler':
      return loadTargetBrawler(schedule.result_id);

    case 'ability':
      return loadTargetAbility(schedule.result_id);

    case 'skin':
      return loadTargetSkin(schedule.result_id);

    case 'icon':
      return loadTargetBrawler(schedule.result_id);

        case 'spray':
            return loadTargetBrawler(schedule.result_id);

    default:
      throw new Error('Unknown result source');

  }

}

async function loadTargetBrawler(id){

  const brawler=normalizeBrawler(
    await one('brawler',{
      select:FIELDS.BRAWLER,
      id:`eq.${id}`
    })
  );

  const hyper=await api('ability',{
    select:FIELDS.ABILITY,
    brawler_id:`eq.${id}`,
    type:'eq.hypercharge',
    limit:'1'
  });

  brawler.hypercharge=hyper[0]||null;

  return brawler;

}

async function loadTargetAbility(id){

  const ability=await one('ability',{
    select:FIELDS.ABILITY,
    id:`eq.${id}`
  });

  const brawler=normalizeBrawler(
    await one('brawler',{
      select:FIELDS.BRAWLER,
      id:`eq.${ability.brawler_id}`
    })
  );

  if(ability.type === "gadget")
    brawler.gadget=ability;
  else if(ability.type === "hypercharge")
    brawler.hypercharge=ability;
  else
    brawler.starPower=ability;

  brawler.ability=ability;

  return brawler;

}

async function loadTargetSkin(id){

  const skin=await one('skin',{
    select:FIELDS.SKIN,
    id:`eq.${id}`
  });

  const brawler=normalizeBrawler(
    await one('brawler',{
      select:FIELDS.BRAWLER,
      id:`eq.${skin.brawler_id}`
    })
  );

  brawler.skin=skin;

  return brawler;

}

// ===============================
// PAGE DETECTION
// ===============================

function detectPage(){

  if(document.getElementById('gadgetImage'))
    return MODE.GADGET;

  if(document.getElementById('starPowerImage'))
    return MODE.STAR_POWER;

  if(document.getElementById('hyperchargeImage'))
    return MODE.HYPERCHARGE;

  if(document.getElementById('skinImage'))
    return MODE.SKIN;

  if(document.getElementById('profileIconImage'))
    return MODE.ICON;

  if(document.getElementById('mysteryImage'))
    return MODE.MYSTERY;

  if(document.getElementById('buffieImage'))
    return MODE.BUFFIE;

  if(document.getElementById('emojiClues'))
    return MODE.EMOJIS;

    if(document.getElementById('sprayImage'))
        return MODE.SPRAY;

  if(document.getElementById('brawlerDescription'))
    return MODE.DESCRIPTION;

    if(document.getElementById('brawlerTitle'))
        return MODE.TITLE;

  return MODE.CLASSIC;

}

// ===============================
// INIT
// ===============================

async function init(){

  try{

    state.mode=detectPage();

        const targetMode = state.mode === MODE.BUFFIE
      ? 'buffie'
            : state.mode === MODE.TITLE
                ? 'title'
      : state.mode === MODE.SPRAY
                ? 'spray'
      : state.mode;

    [state.brawlers,state.target]=await Promise.all([
      loadBrawlers(),
      loadTarget(targetMode)
    ]);

    setupSearch();

    switch(state.mode){

      case MODE.CLASSIC:
        initClassic();
        break;

      case MODE.GADGET:
        initGadget();
        break;

      case MODE.STAR_POWER:
        initStarPower();
        break;

      case MODE.HYPERCHARGE:
        initHypercharge();
        break;

      case MODE.SKIN:
        initSkin();
        break;

      case MODE.ICON:
        initIcon();
        break;

      case MODE.MYSTERY:
        initMystery();
        break;

      case MODE.BUFFIE:
        initBuffie();
        break;

      case MODE.EMOJIS:
        initEmojis();
        break;

      case MODE.DESCRIPTION:
        initDescription();
        break;

            case MODE.TITLE:
                initTitle();
                break;

            case MODE.SPRAY:
                initSpray();
                break;

    }

  }catch(e){

    console.error(e);
    showError(e.message,9999);

  }

}

document.addEventListener('DOMContentLoaded',init);

// ===============================
// SEARCH / AUTOCOMPLETE
// ===============================

function setupSearch(){

    const input=document.getElementById("searchInput");
    const dropdown=document.getElementById("dropdown");
    const wrap=document.querySelector(".search-wrap");
    const button=document.querySelector(".chat-btn");

    let timer;

    function refresh(){

        const q=input.value.trim().toLowerCase();

        const results=state.brawlers
            .filter(b=>!state.guesses.has(b.id))
            .filter(b=>b.name.toLowerCase().startsWith(q))
            .sort((a,b)=>a.name.localeCompare(b.name));

        renderDropdown(results,dropdown,input);

    }

    input.addEventListener("click",refresh);

    input.addEventListener("input",()=>{

        clearTimeout(timer);
        timer=setTimeout(refresh,120);

    });

    input.addEventListener("keydown",e=>{

        if(e.key==="Enter")
            submitGuess();

    });

    button?.addEventListener("click",submitGuess);

    document.addEventListener("click",e=>{

        if(!wrap.contains(e.target))
            dropdown.classList.remove("open");

    });

}

function renderDropdown(list,dropdown,input){

    if(!list.length){

        dropdown.innerHTML="";
        dropdown.classList.remove("open");
        return;

    }

    dropdown.innerHTML=list.map(b=>`

        <div class="dropdown-item" data-id="${b.id}">

            <div class="icon-wrap">
                <img src="${b.icon_path}"
                     onerror="this.src='${IMG_DEFAULT}'">
            </div>

            <div class="d-name">${b.name}</div>

        </div>

    `).join("");

    dropdown.classList.add("open");

    dropdown.querySelectorAll(".dropdown-item").forEach(item=>{

        item.onclick=()=>{

            state.selected=state.brawlers.find(
                b=>b.id==item.dataset.id
            );

            input.value=state.selected.name;

            dropdown.classList.remove("open");

            submitGuess();

        };

    });

}

// ===============================
// GUESS
// ===============================

function submitGuess() {

    if (state.gameOver) return;

    const input = document.getElementById("searchInput");
    const dropdown = document.getElementById("dropdown");

    input.disabled = true;

    if (!state.selected) {

        const q = input.value.trim().toLowerCase();

        state.selected = state.brawlers.find(
            b =>
                b.name.toLowerCase() === q &&
                !state.guesses.has(b.id)
        );

    }

    if (!state.selected) {
        input.disabled = false;
        input.focus();
        return;
    }

    const current = state.selected;
    state.selected = null;

    state.guesses.add(current.id);
    state.attempts++;

    input.value = "";
    dropdown?.classList.remove("open");

    switch (state.mode) {

        case MODE.CLASSIC:
            classicGuess(current);
            break;

        case MODE.GADGET:
            gadgetGuess(current);
            break;

        case MODE.STAR_POWER:
            starPowerGuess(current);
            break;

        case MODE.HYPERCHARGE:
            hyperchargeGuess(current);
            break;

        case MODE.SKIN:
            skinGuess(current);
            break;

        case MODE.ICON:
            iconGuess(current);
            break;

        case MODE.MYSTERY:
            mysteryGuess(current);
            break;

        case MODE.BUFFIE:
            buffieGuess(current);
            break;

        case MODE.EMOJIS:
            emojiGuess(current);
            break;

        case MODE.DESCRIPTION:
            descriptionGuess(current);
            break;

        case MODE.TITLE:
            titleGuess(current);
            break;

        case MODE.SPRAY:
            sprayGuess(current);
            break;

    }

    if (!state.gameOver) {
        input.disabled = false;
        input.focus();
    }

}

// ===============================
// CLASSIC MODE
// ===============================

function initClassic() {

    setupClassicClues();
    updateClassicClues();

}

function classicGuess(brawler) {

    const result = compareBrawler(brawler, state.target);

    renderClassicRow(brawler, result);

    updateClassicClues();

    if (result.correct) {
        finishGame();
        setTimeout(showClassicWin, 700);
    }

}

function compareBrawler(a, b) {

    const diff = a.release_year - b.release_year;

    return {

        correct: a.id === b.id,

        gender: a.gender === b.gender,

        rarity: a.rarity === b.rarity,

        role: a.role === b.role,

        range: a.attack_range === b.attack_range,

        movement: a.movement === b.movement,

        year:
            diff === 0 ? "equal" :
            diff < 0 ? "higher" :
            "lower"

    };

}

function renderClassicRow(brawler, result) {

    const list = document.getElementById("guessesList");

    list.querySelector(".empty-state")?.remove();

    const arrow =
        result.year === "equal"
            ? ""
            : `<img class="release-arrow ${result.year==="lower"?"is-down":""}"
                    src="${RELEASE_ARROW}">`;

    const row = document.createElement("div");

    row.className = "guess-row";

    row.innerHTML = `

<div class="cell ${result.correct?"cell-correct":"cell-wrong"} cell-name">
    <div class="icon-wrap">
        <img src="${brawler.icon_path}" onerror="this.src='${IMG_DEFAULT}'">
    </div>
</div>

<div class="cell ${result.gender?"cell-correct":"cell-wrong"}">
${pretty(brawler.gender)}
</div>

<div class="cell ${result.rarity?"cell-correct":"cell-wrong"}">
${pretty(brawler.rarity)}
</div>

<div class="cell ${result.role?"cell-correct":"cell-wrong"}">
${pretty(brawler.role)}
</div>

<div class="cell ${result.range?"cell-correct":"cell-wrong"}">
${pretty(brawler.attack_range)}
</div>

<div class="cell ${result.movement?"cell-correct":"cell-wrong"}">
${pretty(brawler.movement)}
</div>

<div class="cell ${result.year==="equal"?"cell-correct":"cell-wrong"}">
<span class="release-year-wrap">
${brawler.release_year}
${arrow}
</span>
</div>

`;

    list.prepend(row);

}

// ===============================
// CLASSIC WIN
// ===============================

function showClassicWin() {

    document.getElementById("wonBrawlerIcon").src = state.target.icon_path;
    document.getElementById("wonBrawlerIcon").alt = state.target.name;
    document.getElementById("wonScore").textContent = `Score: ${state.attempts}`;

    const won = document.getElementById("wonSection");
    won.classList.add("visible");

    setTimeout(() => {
        won.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }, 150);

}

// ===============================
// CLASSIC CLUES
// ===============================

const CLASSIC_CLUES = {
    DESC: 4,
    HYPER: 6
};

function setupClassicClues() {

    $("#descClueBtn")?.addEventListener("click", () => {

        if (state.attempts >= CLASSIC_CLUES.DESC)
            toggleClassicPopup("desc");

    });

    $("#hyperClueBtn")?.addEventListener("click", () => {

        if (state.attempts >= CLASSIC_CLUES.HYPER)
            toggleClassicPopup("hyper");

    });

}

function updateClassicClues() {

    const descUnlocked = state.attempts >= CLASSIC_CLUES.DESC;
    const hyperUnlocked = state.attempts >= CLASSIC_CLUES.HYPER;

    updateCard(
        "desc",
        descUnlocked,
        CLASSIC_CLUES.DESC - state.attempts
    );

    updateCard(
        "hyper",
        hyperUnlocked,
        CLASSIC_CLUES.HYPER - state.attempts
    );

    $("#cluePopupTextDesc").textContent =
        state.target.description || "Unknown";

    const img = $("#cluePopupHyperImage");
    const txt = $("#cluePopupTextHyper");

    if (state.target.hypercharge) {

        img.src = state.target.hypercharge.image_path;
        img.alt = state.target.hypercharge.name;
        img.style.display = "";

        txt.textContent = state.target.hypercharge.name;

    } else {

        img.style.display = "none";
        txt.textContent = "Unknown";

    }

}

function updateCard(type, unlocked, remaining) {

    $("#"+type+"ClueBtn")
        .classList.toggle("unlocked", unlocked);

    $("#"+type+"ClueIcon").src =
        unlocked
            ? `../assets/design/icon-clue_${type==="hyper"?"hypercharge":type}.png`
            : `../assets/design/icon-clue_${type==="hyper"?"hypercharge":type}_lock.png`;

    $("#"+type+"ClueTries").textContent =
        Math.max(0, remaining);

    $("#"+type+"ClueStatus").textContent =
        remaining > 0
            ? `in ${remaining} tries`
            : "";

}

function toggleClassicPopup(type) {

    if (
        state.clue.active === type &&
        $("#"+type+"ClueBtn").classList.contains("showing-clue")
    ) {

        closeClassicPopup();
        return;

    }

    openClassicPopup(type);

}

function openClassicPopup(type) {

    const other = type === "desc"
        ? "hyper"
        : "desc";

    $("#"+type+"ClueBtn")
        .classList.add("showing-clue");

    $("#"+other+"ClueBtn")
        .classList.remove("showing-clue");

    $("#"+type+"ClueBubble")
        .setAttribute("aria-hidden","false");

    $("#"+other+"ClueBubble")
        .setAttribute("aria-hidden","true");

    state.clue.active = type;

}

function closeClassicPopup() {

    ["desc","hyper"].forEach(t=>{

        $("#"+t+"ClueBtn")
            .classList.remove("showing-clue");

        $("#"+t+"ClueBubble")
            .setAttribute("aria-hidden","true");

    });

    state.clue.active = null;

}

// ===============================
// GADGET MODE
// ===============================

const GADGET_CLUES = {
    NAME: 4,
    DESC: 6
};

function initGadget() {

    displayAbilityImage(
        "gadgetImage",
        state.target.gadget
    );

    setupAbilityClues(
        GADGET_CLUES,
        state.target.gadget
    );

    updateAbilityClues(
        GADGET_CLUES,
        state.target.gadget
    );

}

function gadgetGuess(brawler) {

    const correct =
        brawler.id === state.target.id;

    renderSimpleGuess(
        brawler,
        correct
    );

    updateAbilityClues(
        GADGET_CLUES,
        state.target.gadget
    );

    if(correct){

        finishGame();
        setTimeout(showSimpleWin,700);

    }

}

// ===============================
// STAR POWER MODE
// ===============================

const STAR_CLUES = {
    NAME:4,
    DESC:6
};

function initStarPower(){

    displayAbilityImage(
        "starPowerImage",
        state.target.starPower
    );

    setupAbilityClues(
        STAR_CLUES,
        state.target.starPower
    );

    updateAbilityClues(
        STAR_CLUES,
        state.target.starPower
    );

}

function starPowerGuess(brawler){

    const correct=
        brawler.id===state.target.id;

    renderSimpleGuess(
        brawler,
        correct
    );

    updateAbilityClues(
        STAR_CLUES,
        state.target.starPower
    );

    if(correct){

        finishGame();
        setTimeout(showSimpleWin,700);

    }

}

// ===============================
// HYPERCHARGE MODE
// ===============================

const HYPERCHARGE_CLUES = {
    NAME:4,
    DESC:6
};

function initHypercharge(){

    displayAbilityImage(
        "hyperchargeImage",
        state.target.hypercharge
    );

    setupAbilityClues(
        HYPERCHARGE_CLUES,
        state.target.hypercharge
    );

    updateAbilityClues(
        HYPERCHARGE_CLUES,
        state.target.hypercharge
    );

}

function hyperchargeGuess(brawler){

    const correct=
        brawler.id===state.target.id;

    renderSimpleGuess(
        brawler,
        correct
    );

    updateAbilityClues(
        HYPERCHARGE_CLUES,
        state.target.hypercharge
    );

    if(correct){

        finishGame();
        setTimeout(showSimpleWin,700);

    }

}

// ===============================
// SHARED ABILITY FUNCTIONS
// ===============================

function displayAbilityImage(id,ability){

    const img=$("#"+id);

    if(!img||!ability) return;

    img.src=ability.image_path;
    img.alt=ability.name;

    img.onerror=()=>img.removeAttribute("src");

}

function renderSimpleGuess(brawler,correct){

    const list=$("#resultsList");

    list.querySelector(".empty-state")?.remove();

    const row=document.createElement("div");

    row.className=`result-row ${
        correct?"correct":"wrong"
    }`;

    row.innerHTML=`

<div class="icon-wrap">
<img src="${brawler.icon_path}"
onerror="this.src='${IMG_DEFAULT}'">
</div>

<span class="result-name subtitle">
${brawler.name}
</span>

`;

    list.prepend(row);

}

function showSimpleWin() {

    $("#wonBrawlerIcon").src = state.target.icon_path;
    $("#wonBrawlerIcon").alt = state.target.name;
    $("#wonBrawlerName").textContent = state.target.name;
    $("#wonScore").textContent = `Score: ${state.attempts}`;

    const won = $("#wonSection");
    won.classList.add("visible");

    setTimeout(() => {
        won.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }, 150);

}

// ===============================
// SHARED ABILITY CLUES
// ===============================

function setupAbilityClues(config, ability) {

    $("#nameClueBtn")?.addEventListener("click", () => {
        if (state.attempts >= config.NAME)
            toggleAbilityPopup("name");
    });

    $("#descClueBtn")?.addEventListener("click", () => {
        if (state.attempts >= config.DESC)
            toggleAbilityPopup("desc");
    });

}

function updateAbilityClues(config, ability) {

    updateAbilityCard(
        "name",
        config.NAME,
        state.attempts
    );

    updateAbilityCard(
        "desc",
        config.DESC,
        state.attempts
    );

    $("#cluePopupTextName").textContent =
        ability?.name || "Unknown";

    $("#cluePopupTextDesc").textContent =
        ability?.description || "Unknown";

}

function updateAbilityCard(type, unlockAt, attempts) {

    const unlocked = attempts >= unlockAt;

    $("#"+type+"ClueBtn")
        ?.classList.toggle("unlocked", unlocked);

    $("#"+type+"ClueIcon").src =
        unlocked
        ? `../assets/design/icon-clue_${type}.png`
        : `../assets/design/icon-clue_${type}_lock.png`;

    $("#"+type+"ClueTries").textContent =
        Math.max(0, unlockAt - attempts);

    $("#"+type+"ClueStatus").textContent =
        attempts < unlockAt
        ? `in ${unlockAt-attempts} tries`
        : "";

}

function toggleAbilityPopup(type){

    if(
        state.clue.active===type &&
        $("#"+type+"ClueBtn")
            .classList.contains("showing-clue")
    ){
        closeAbilityPopup();
        return;
    }

    openAbilityPopup(type);

}

function openAbilityPopup(type){

    const other =
        type==="name"
        ? "desc"
        : "name";

    $("#"+type+"ClueBtn")
        .classList.add("showing-clue");

    $("#"+other+"ClueBtn")
        .classList.remove("showing-clue");

    $("#"+type+"ClueBubble")
        .setAttribute("aria-hidden","false");

    $("#"+other+"ClueBubble")
        .setAttribute("aria-hidden","true");

    state.clue.active=type;

}

function closeAbilityPopup(){

    ["name","desc"].forEach(type=>{

        $("#"+type+"ClueBtn")
            .classList.remove("showing-clue");

        $("#"+type+"ClueBubble")
            .setAttribute("aria-hidden","true");

    });

    state.clue.active=null;

}

// ===============================
// SKIN MODE
// ===============================

const SKIN_BLUR_LEVELS = [20,18,16,14,12,10,8,6,4,2,0];

function initSkin(){

    displaySkin();

    updateSkinBlur();

}

function skinGuess(brawler){

    const correct =
        brawler.id === state.target.id;

    renderSimpleGuess(
        brawler,
        correct
    );

    updateSkinBlur();

    if(correct){

        finishGame();
        setTimeout(showSkinWin,700);

    }

}

function displaySkin(){

    const img=$("#skinImage");

    if(!img) return;

    img.src=state.target.skin.image_path;
    img.alt=state.target.skin.name;

    img.onerror=()=>img.removeAttribute("src");

}

function updateSkinBlur() {
    const frame = document.querySelector('.skin-frame');
    if (!frame) return;

    const blur = SKIN_BLUR_LEVELS[
    Math.min(state.attempts, SKIN_BLUR_LEVELS.length - 1)
    ];

    frame.style.setProperty("--skin-blur", `${blur}px`);

    const counter = document.getElementById('skinGuessCount');
    if (counter)
        counter.textContent = `${state.attempts} / ${SKIN_BLUR_LEVELS.length - 1} guesses`;
}

function showSkinWin(){

    $(".skin-frame")
        ?.style.setProperty(
            "--skin-blur",
            "0px"
        );

    showSimpleWin();

}

// ===============================
// ICON MODE
// ===============================

const ICON_ZOOM_LEVELS = [4, 3, 2, 1];

function initIcon(){
    displayProfileIcon();
    updateIconZoom();
}

function iconGuess(brawler){
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateIconZoom();

    if(correct){
        finishGame();
        setTimeout(showIconWin, 700);
    }
}

function displayProfileIcon(){
    const img = $('#profileIconImage');
    if(!img) return;

    img.src = state.target.profile_icon_path;
    img.alt = `Icône de profil de ${state.target.name}`;
    img.onerror = () => img.removeAttribute('src');
}

function updateIconZoom(){
    const viewport = document.querySelector('.profile-icon-viewport');
    if(!viewport) return;

    const zoom = ICON_ZOOM_LEVELS[
        Math.min(state.attempts, ICON_ZOOM_LEVELS.length - 1)
    ];
    viewport.style.setProperty('--icon-zoom', `${zoom * 100}%`);
}

function showIconWin(){
    document.querySelector('.profile-icon-viewport')
        ?.style.setProperty('--icon-zoom', '100%');
    showSimpleWin();
}

// ===============================
// MYSTERY MODE
// ===============================

function initMystery(){

    displayMystery();

}

function mysteryGuess(brawler){

    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);

    if(correct){

        revealMystery();
        finishGame();
        setTimeout(showMysteryWin,700);

    }

}

function revealMystery(){

    $("#mysteryImage")?.classList.add('is-revealed');

}

function displayMystery(){

    const img=$("#mysteryImage");
    if(!img) return;

    img.src=state.target.skin.image_path;
    img.alt='Silhouette du brawler mystère';
    img.onerror=()=>img.removeAttribute("src");

}

function showMysteryWin(){
    showSimpleWin();

}

// ===============================
// BUFFIE MODE
// ===============================

const BUFFIE_CLUES = {
    ICON: 4,
    IMAGE: 6
};

function initBuffie(){
    displayBuffie();
    setupBuffieClues();
    updateBuffieClues();
}

function buffieGuess(brawler){
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateBuffieClues();

    if(correct){
        revealBuffie();
        finishGame();
        setTimeout(showSimpleWin, 700);
    }
}

function displayBuffie(){
    const img = $("#buffieImage");
    if(!img) return;

    img.src = state.target.ability?.image_path || "";
    img.alt = "Silhouette du buffie";
    img.onerror = () => img.removeAttribute("src");
}

function setupBuffieClues(){
    $("#buffieIconClueBtn")?.addEventListener("click", () => {
        if(state.attempts >= BUFFIE_CLUES.ICON)
            toggleBuffieIconClue();
    });

    $("#buffieImageClueBtn")?.addEventListener("click", () => {
        if(state.attempts >= BUFFIE_CLUES.IMAGE)
            toggleBuffieImage();
    });
}

function updateBuffieClues(){
    updateBuffieCard("Icon", BUFFIE_CLUES.ICON);
    updateBuffieCard("Image", BUFFIE_CLUES.IMAGE);

    const icon = $("#buffieIconClueImage");
    if(icon){
        icon.src = state.target.ability?.description || "";
        icon.alt = "Icône du buffie";
        icon.onerror = () => icon.removeAttribute("src");
    }
}

function updateBuffieCard(type, unlockAt){
    const unlocked = state.attempts >= unlockAt;
    const id = `buffie${type}Clue`;

    $("#"+id+"Btn")?.classList.toggle("unlocked", unlocked);
    $("#"+id+"Icon").src = unlocked
        ? `../assets/design/icon-clue_${type === "Icon" ? "desc" : "buffie"}.png`
        : `../assets/design/icon-clue_${type === "Icon" ? "desc" : "buffie"}_lock.png`;
    $("#"+id+"Tries").textContent = Math.max(0, unlockAt - state.attempts);
    $("#"+id+"Status").textContent = unlocked ? "" : `in ${unlockAt - state.attempts} tries`;
}

function toggleBuffieIconClue(){
    const card = $("#buffieIconClueBtn");
    const bubble = $("#buffieIconClueBubble");
    const isOpen = card.classList.toggle("showing-clue");

    bubble.setAttribute("aria-hidden", String(!isOpen));
}

function revealBuffie(){
    $("#buffieImage")?.classList.add("is-revealed");
}

function toggleBuffieImage(){
    $("#buffieImage")?.classList.toggle("is-revealed");
}

// ===============================
// HELPERS
// ===============================

function $(selector){

    if(selector.startsWith("#"))
        return document.getElementById(
            selector.slice(1)
        );

    return document.querySelector(selector);

}

function showError(msg,time=3000){

    const banner=$("#errorBanner");

    if(!banner) return;

    $("#errorMsg").textContent=msg;

    banner.classList.add("visible");

    if(time<9000){

        setTimeout(()=>{

            banner.classList.remove("visible");

        },time);

    }

}

// ===============================
// EMOJI MODE
// ===============================

const EMOJI_CLUE_COUNT = 4;

function splitEmojiClues(value) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
        return Array.from(
            new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value || ""),
            part => part.segment
        );
    }

    return Array.from(value || "");
}

function initEmojis() {
    const clues = splitEmojiClues(state.target.emojis).slice(0, EMOJI_CLUE_COUNT);
    state.target.emojiClues = clues;

    if (clues.length !== EMOJI_CLUE_COUNT) {
        throw new Error("This brawler needs exactly 4 emoji clues.");
    }

    updateEmojiClues();
}

function emojiGuess(brawler) {
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateEmojiClues();

    if (correct) {
        finishGame();
        setTimeout(showSimpleWin, 700);
    }
}

function updateEmojiClues() {
    const clues = state.target.emojiClues || [];

    document.querySelectorAll(".emoji-clue").forEach((clue, index) => {
        const unlocked = index <= state.attempts;
        const image = clue.querySelector("img");
        const value = clue.querySelector(".emoji-clue-value");

        clue.classList.toggle("is-unlocked", unlocked);
        clue.setAttribute("aria-label", unlocked ? `Indice ${index + 1}: ${clues[index]}` : `Indice ${index + 1} verrouillé`);
        image.src = unlocked
            ? "../assets/design/icon-clue_bubble.png"
            : "../assets/design/icon-clue_bubble_2.png";
        value.textContent = unlocked ? clues[index] : "";
    });
}

// ===============================
// SPRAY MODE
// ===============================

function initSpray() {
    const image = $("#sprayImage");

    if (!state.target.spray) {
        throw new Error("This brawler needs a spray image.");
    }

    image.src = state.target.spray;
    image.alt = `Spray de ${state.target.name}`;
    image.onerror = () => image.removeAttribute("src");

    setupTitleClues();
    updateTitleClues();
}

function sprayGuess(brawler) {
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateTitleClues();

    if (correct) {
        finishGame();
        setTimeout(showSimpleWin, 700);
    }
}

// ===============================
// DESCRIPTION MODE
// ===============================

const DESCRIPTION_WORD_INTERVALS = [2, 4, 8, 16, 0];

const TITLE_CLUES = {
    PRESTIGE_TITLE: 4,
    ICON: 6
};

function initTitle() {
    updateBrawlerTitle();
    setupTitleClues();
    updateTitleClues();
}

function titleGuess(brawler) {
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateBrawlerTitle(correct);
    updateTitleClues();

    if (correct) {
        finishGame();
        setTimeout(showSimpleWin, 700);
    }
}

function updateBrawlerTitle(reveal = false) {
    const title = $("#brawlerTitle");
    if (!title) return;

    title.textContent = state.target.title || "Unknown";
}

function setupTitleClues() {
    $("#prestigeTitleClueBtn")?.addEventListener("click", () => {
        if (state.attempts >= TITLE_CLUES.PRESTIGE_TITLE)
            toggleTitlePopup("prestigeTitle");
    });

    $("#titleIconClueBtn")?.addEventListener("click", () => {
        if (state.attempts >= TITLE_CLUES.ICON)
            toggleTitlePopup("icon");
    });
}

function updateTitleClues() {
    updateTitleCard("prestigeTitle", TITLE_CLUES.PRESTIGE_TITLE);
    updateTitleCard("titleIcon", TITLE_CLUES.ICON);

    $("#cluePopupTextPrestigeTitle").textContent =
        state.target.prestige_title || "Unknown";

    const icon = $("#cluePopupTitleIcon");
    if (icon) {
        icon.src = state.target.profile_icon_path || "";
        icon.alt = `Icône de profil de ${state.target.name}`;
    }
}

function updateTitleCard(type, unlockAt) {
    const unlocked = state.attempts >= unlockAt;
    const iconType = type === "prestigeTitle" ? "title" : "desc";

    $("#" + type + "ClueBtn")?.classList.toggle("unlocked", unlocked);
    $("#" + type + "ClueIcon").src = unlocked
        ? `../assets/design/icon-clue_${iconType}.png`
        : `../assets/design/icon-clue_${iconType}_lock.png`;
    $("#" + type + "ClueTries").textContent = Math.max(0, unlockAt - state.attempts);
    $("#" + type + "ClueStatus").textContent = state.attempts < unlockAt
        ? `in ${unlockAt - state.attempts} tries`
        : "";
}

function toggleTitlePopup(type) {
    const card = $("#" + (type === "prestigeTitle" ? "prestigeTitle" : "titleIcon") + "ClueBtn");
    const other = $("#" + (type === "prestigeTitle" ? "titleIcon" : "prestigeTitle") + "ClueBtn");
    const bubble = $("#" + (type === "prestigeTitle" ? "prestigeTitle" : "titleIcon") + "ClueBubble");
    const otherBubble = $("#" + (type === "prestigeTitle" ? "titleIcon" : "prestigeTitle") + "ClueBubble");
    const isOpen = card.classList.contains("showing-clue");

    card.classList.toggle("showing-clue", !isOpen);
    other.classList.remove("showing-clue");
    bubble.setAttribute("aria-hidden", String(isOpen));
    otherBubble.setAttribute("aria-hidden", "true");
    state.clue.active = isOpen ? null : type;
}

function initDescription() {
    updateBrawlerDescription();
}

function descriptionGuess(brawler) {
    const correct = brawler.id === state.target.id;

    renderSimpleGuess(brawler, correct);
    updateBrawlerDescription(correct);

    if (correct) {
        finishGame();
        setTimeout(showSimpleWin, 700);
    }
}

function updateBrawlerDescription(reveal = false) {
    const description = $("#brawlerDescription");
    if (!description) return;

    const text = state.target.description || "Unknown";

    if (reveal) {
        description.textContent = text;
        return;
    }

    const interval = DESCRIPTION_WORD_INTERVALS[
        Math.min(state.attempts, DESCRIPTION_WORD_INTERVALS.length - 1)
    ];

    description.textContent = maskDescriptionWords(
        text,
        interval
    );
}

function maskDescriptionWords(text, interval) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);

    return words.map((word, index) =>
        (index + 1) % interval === 0 ? "_" : word
    ).join(" ");
}
