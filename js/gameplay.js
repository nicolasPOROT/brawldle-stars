const SUPABASE_URL      = 'https://szvogkodnqqkkkzbiihd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo';
const CLASSIC_MODE_ID        = 1;
const GADGET_MODE_ID         = 2;
const STAR_POWER_MODE_ID     = 3;
const SKIN_MODE_ID           = 4;

const IMG_DEFAULT        = '../assets/brawlers/default.png';
const RELEASE_ARROW_ICON = '../assets/design/arrow-icon.png';

const GAME_MODE_FIELDS      = 'id,name,result_source,is_enabled,label';
const DAILY_SCHEDULE_FIELDS = 'result_id,mode_slot';
const ABILITY_FIELDS        = 'id,brawler_id,type,slot,name,image_path,description';
const SKIN_FIELDS           = 'id,brawler_id,name,campaign,rarity,image_path';

const DESC_CLUE_UNLOCK_ATTEMPTS  = 4;
const HYPER_CLUE_UNLOCK_ATTEMPTS = 6;
const GADGET_NAME_CLUE_ATT       = 4;
const GADGET_DESC_CLUE_ATT       = 6;
const SP_NAME_CLUE_ATT           = 4;
const SP_DESC_CLUE_ATT           = 6;

const BRAWLER_FIELDS = [
  'id', 'name', 'icon_path', 'gender', 'rarity', 'class',
  'attack_range', 'movement', 'release_year', 'description',
].join(',');

// ═══════════════════════════════════════════════════
//  STATE classic
// ═══════════════════════════════════════════════════
let allBrawlers     = [];
let target          = null;
let guessedIds      = new Set();
let selectedBrawler = null;
let gameOver        = false;
let attemptCount    = 0;
let descClueUnlocked  = false;
let hyperClueUnlocked = false;
let activeClueType  = null;

// ═══════════════════════════════════════════════════
//  SUPABASE
// ═══════════════════════════════════════════════════
async function supabaseFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      apikey:        SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`[${table}] ${res.status} – ${await res.text()}`);
  return res.json();
}

// ═══════════════════════════════════════════════════
//  INIT classic
// ═══════════════════════════════════════════════════
async function init() {
  try {
    [allBrawlers, target] = await Promise.all([loadActiveBrawlers(), loadDailyTarget()]);
    setupSearch();
    setupClueUI();
    updateClueCards();
  } catch (e) {
    showError('Erreur de chargement : ' + e.message, 9999);
  }
}

// ═══════════════════════════════════════════════════
//  CHARGEMENT DONNÉES classic
// ═══════════════════════════════════════════════════
async function loadActiveBrawlers() {
  const rows = await supabaseFetch('brawler', {
    select:    BRAWLER_FIELDS,
    is_active: 'eq.true',
    order:     'name.asc',
  });
  return rows.map(normalizeBrawlerRecord);
}

async function loadGameModeConfig(modeId) {
  const rows = await supabaseFetch('game_mode', {
    select: GAME_MODE_FIELDS,
    id:     `eq.${modeId}`,
    limit:  '1',
  });

  if (!rows.length) {
    throw new Error(`Mode de jeu introuvable pour l'id ${modeId}`);
  }

  const mode = rows[0];
  mode.result_source = normalizeResultSource(mode.result_source);
  if (!mode.is_enabled) {
    throw new Error(`Le mode ${mode.name} est désactivé`);
  }

  return mode;
}

function getExpectedTargetSource(modeId) {
  switch (modeId) {
    case CLASSIC_MODE_ID: return 'brawler';
    case GADGET_MODE_ID: return 'ability';
    case STAR_POWER_MODE_ID: return 'ability';
    case SKIN_MODE_ID: return 'skin';
    default: return null;
  }
}

function normalizeResultSource(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveTargetTable(resultSource) {
  const source = normalizeResultSource(resultSource);
  const sourceMap = {
    brawler: 'brawler',
    ability: 'ability',
    gadget: 'ability',
    star_power: 'ability',
    hypercharge: 'ability',
    skin: 'skin',
  };
  return sourceMap[source] ?? null;
}

function resolveTargetTableForMode(modeId, resultSource) {
  return resolveTargetTable(resultSource) ?? getExpectedTargetSource(modeId);
}

async function loadDailyScheduleEntry(modeId, today) {
  const rows = await supabaseFetch('daily_schedule', {
    select:    DAILY_SCHEDULE_FIELDS,
    play_date: `eq.${today}`,
    mode_id:   `eq.${modeId}`,
    limit:     '1',
  });

  if (!rows.length || rows[0].result_id == null) {
    throw new Error(`Aucune cible configurée pour le mode ${modeId} du ${today}`);
  }

  return rows[0];
}

async function loadSingleById(table, id, select, errorMessage) {
  const rows = await supabaseFetch(table, {
    select,
    id:    `eq.${id}`,
    limit: '1',
  });

  if (!rows.length) {
    throw new Error(errorMessage ?? `Aucune ligne trouvée dans ${table} pour l'id ${id}`);
  }

  return rows[0];
}

async function loadDailyTarget() {
  const today = new Date().toISOString().split('T')[0];
  const mode = await loadGameModeConfig(CLASSIC_MODE_ID);
  if (resolveTargetTableForMode(CLASSIC_MODE_ID, mode.result_source) !== 'brawler') {
    throw new Error(`Le mode ${mode.name} attend une cible brawler`);
  }

  const schedule = await loadDailyScheduleEntry(CLASSIC_MODE_ID, today);
  const brawler = normalizeBrawlerRecord(
    await loadSingleById('brawler', schedule.result_id, BRAWLER_FIELDS, `Brawler introuvable pour la cible ${schedule.result_id}`),
  );

  const abilityRows = await supabaseFetch('ability', {
    select:     ABILITY_FIELDS,
    brawler_id: `eq.${brawler.id}`,
    type:       'eq.hypercharge',
    limit:      '1',
  });

  brawler.hypercharge = abilityRows.length ? abilityRows[0] : null;
  return brawler;
}

// ═══════════════════════════════════════════════════
//  NORMALISATION
// ═══════════════════════════════════════════════════
function normalizeBrawlerRecord(r) {
  return {
    id:           Number(r.id),
    name:         r.name,
    gender:       r.gender?.trim().toLowerCase()                      ?? '',
    rarity:       r.rarity?.trim().toLowerCase().replace(/\s+/g, '_') ?? '',
    role:         (r.class ?? r.role)?.trim()                         ?? '',
    attack_range: normalizeAttackRange(r.attack_range),
    movement:     normalizeMovement(r.movement),
    release_year: Number(r.release_year),
    icon_path:    r.icon_path   ?? '',
    description:  r.description ?? '',
  };
}

function normalizeAttackRange(value) {
  if (typeof value !== 'string') return value ?? '';
  const map = {
    'very short': 'short', short: 'short',
    medium: 'normal',      normal: 'normal',
    long: 'long',
    'very long': 'very_long', very_long: 'very_long',
  };
  return map[value.trim().toLowerCase()] ?? value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeMovement(value) {
  if (typeof value !== 'string') return value ?? '';
  const map = {
    'very slow': 'very_slow', very_slow: 'very_slow',
    slow: 'slow', normal: 'normal', fast: 'fast',
    'very fast': 'very_fast', very_fast: 'very_fast',
  };
  return map[value.trim().toLowerCase()] ?? value.trim().toLowerCase().replace(/\s+/g, '_');
}

function formatLabel(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ')
    .split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
    .join(' ');
}

// ═══════════════════════════════════════════════════
//  AUTOCOMPLETE classic
// ═══════════════════════════════════════════════════
function getAutocompleteResults(query) {
  const q = query.trim().toLowerCase();
  return allBrawlers
    .filter(b => !guessedIds.has(b.id) && b.name.toLowerCase().startsWith(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

function renderAutocomplete(results, dropdown, input) {
  if (!results.length) {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    return;
  }
  dropdown.innerHTML = results.map(b => `
    <div class="dropdown-item" data-id="${b.id}">
      <div class="icon-wrap">
        <img src="${b.icon_path}" alt="${b.name}" onerror="this.src='${IMG_DEFAULT}'" />
      </div>
      <div class="d-name">${b.name}</div>
    </div>
  `).join('');
  dropdown.classList.add('open');
  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedBrawler = allBrawlers.find(b => b.id === parseInt(el.dataset.id, 10)) ?? null;
      if (!selectedBrawler) return;
      input.value = selectedBrawler.name;
      dropdown.classList.remove('open');
      submitGuess();
    });
  });
}

function setupSearch() {
  const input      = document.getElementById('searchInput');
  const dropdown   = document.getElementById('dropdown');
  const searchWrap = document.querySelector('.search-wrap');
  const chatBtn    = document.querySelector('.chat-btn');
  let timer;
  const updateDropdown = () =>
    renderAutocomplete(getAutocompleteResults(input.value), dropdown, input);
  input.addEventListener('click',   () => { clearTimeout(timer); updateDropdown(); });
  input.addEventListener('input',   () => { clearTimeout(timer); timer = setTimeout(updateDropdown, 150); });
  input.addEventListener('keydown', e  => { if (e.key === 'Enter') submitGuess(); });
  chatBtn?.addEventListener('click', submitGuess);
  document.addEventListener('click', e => {
    if (searchWrap && !searchWrap.contains(e.target)) dropdown.classList.remove('open');
  });
}

// ═══════════════════════════════════════════════════
//  GUESS classic
// ═══════════════════════════════════════════════════
function submitGuess() {
  if (gameOver) return;
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  if (!selectedBrawler) {
    const q = input.value.trim().toLowerCase();
    selectedBrawler = q
      ? (allBrawlers.find(b => b.name.toLowerCase() === q && !guessedIds.has(b.id)) ?? null)
      : null;
  }
  if (!selectedBrawler || guessedIds.has(selectedBrawler.id)) return;
  input.disabled = true;
  guessedIds.add(selectedBrawler.id);
  attemptCount++;
  dropdown.classList.remove('open');
  const result = computeResult(selectedBrawler, target);
  renderRow(selectedBrawler, result);
  updateClueCards();
  input.value     = '';
  selectedBrawler = null;
  input.disabled  = false;
  input.focus();
  if (result.correct) { gameOver = true; setTimeout(showWin, 700); }
}

// ═══════════════════════════════════════════════════
//  GAME LOGIC classic
// ═══════════════════════════════════════════════════
function computeResult(guess, tgt) {
  const yearDiff = guess.release_year - tgt.release_year;
  return {
    correct:  guess.id           === tgt.id,
    gender:   guess.gender       === tgt.gender       ? 'correct' : 'wrong',
    rarity:   guess.rarity       === tgt.rarity       ? 'correct' : 'wrong',
    role:     guess.role         === tgt.role         ? 'correct' : 'wrong',
    range:    guess.attack_range === tgt.attack_range ? 'correct' : 'wrong',
    movement: guess.movement     === tgt.movement     ? 'correct' : 'wrong',
    year:     yearDiff === 0 ? 'correct' : yearDiff < 0 ? 'higher' : 'lower',
  };
}

function renderRow(brawler, result) {
  const list = document.getElementById('guessesList');
  list.querySelector('.empty-state')?.remove();
  const releaseArrow = result.year === 'correct' ? '' :
    `<img class="release-arrow${result.year === 'lower' ? ' is-down' : ''}"
          src="${RELEASE_ARROW_ICON}" alt="" aria-hidden="true" />`;
  const row = document.createElement('div');
  row.className = 'guess-row';
  row.innerHTML = `
    <div class="cell ${result.correct ? 'cell-correct' : 'cell-wrong'} cell-name">
      <div class="icon-wrap">
        <img src="${brawler.icon_path}" alt="${brawler.name}" onerror="this.src='${IMG_DEFAULT}'" />
      </div>
    </div>
    <div class="cell ${result.gender   === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.gender)}</div>
    <div class="cell ${result.rarity   === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.rarity)}</div>
    <div class="cell ${result.role     === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.role)}</div>
    <div class="cell ${result.range    === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.attack_range)}</div>
    <div class="cell ${result.movement === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.movement)}</div>
    <div class="cell ${result.year     === 'correct' ? 'cell-correct' : 'cell-wrong'}">
      <span class="release-year-wrap">${brawler.release_year}${releaseArrow}</span>
    </div>
  `;
  list.insertBefore(row, list.firstChild);
}

// ═══════════════════════════════════════════════════
//  CLUE SYSTEM classic
// ═══════════════════════════════════════════════════
function setupClueUI() {
  document.getElementById('descClueBtn').addEventListener('click', () => {
    if (descClueUnlocked) toggleCluePopup('desc');
  });
  document.getElementById('hyperClueBtn').addEventListener('click', () => {
    if (hyperClueUnlocked) toggleCluePopup('hyper');
  });
}

function remainingClueTries(type) {
  const threshold = type === 'desc' ? DESC_CLUE_UNLOCK_ATTEMPTS : HYPER_CLUE_UNLOCK_ATTEMPTS;
  return Math.max(0, threshold - attemptCount);
}

function updateClueCards() {
  descClueUnlocked  = attemptCount >= DESC_CLUE_UNLOCK_ATTEMPTS;
  hyperClueUnlocked = attemptCount >= HYPER_CLUE_UNLOCK_ATTEMPTS;
  const descRemaining  = remainingClueTries('desc');
  const hyperRemaining = remainingClueTries('hyper');

  document.getElementById('descClueIcon').src = descClueUnlocked
    ? '../assets/design/icon-clue_desc.png'
    : '../assets/design/icon-clue_desc_lock.png';
  document.getElementById('hyperClueIcon').src = hyperClueUnlocked
    ? '../assets/design/icon-clue_hypercharge.png'
    : '../assets/design/icon-clue_hypercharge_lock.png';

  document.getElementById('descClueBtn').classList.toggle('unlocked', descClueUnlocked);
  document.getElementById('hyperClueBtn').classList.toggle('unlocked', hyperClueUnlocked);

  document.getElementById('descClueTries').textContent   = descRemaining;
  document.getElementById('hyperClueTries').textContent  = hyperRemaining;
  document.getElementById('descClueStatus').textContent  = descRemaining  > 0 ? `in ${descRemaining} tries`  : '';
  document.getElementById('hyperClueStatus').textContent = hyperRemaining > 0 ? `in ${hyperRemaining} tries` : '';

  document.getElementById('cluePopupTextDesc').textContent =
    target?.description?.trim() || 'Unknown';

  const hyperImg  = document.getElementById('cluePopupHyperImage');
  const hyperText = document.getElementById('cluePopupTextHyper');
  if (hyperImg) {
    hyperImg.src           = target?.hypercharge?.image_path || '';
    hyperImg.alt           = target?.hypercharge?.name       || '';
    hyperImg.style.display = target?.hypercharge?.image_path ? '' : 'none';
  }
  if (hyperText) {
    hyperText.textContent = target?.hypercharge?.name || 'Unknown';
  }
}

function toggleCluePopup(type) {
  const card = document.getElementById(type === 'desc' ? 'descClueBtn' : 'hyperClueBtn');
  (activeClueType === type && card.classList.contains('showing-clue'))
    ? closeCluePopup()
    : openCluePopup(type);
}

function openCluePopup(type) {
  const showDesc = type === 'desc';
  document.getElementById('descClueBtn').classList.toggle('showing-clue',   showDesc);
  document.getElementById('hyperClueBtn').classList.toggle('showing-clue',  !showDesc);
  document.getElementById('descClueBtn').setAttribute('aria-expanded',   String(showDesc));
  document.getElementById('hyperClueBtn').setAttribute('aria-expanded',  String(!showDesc));
  document.getElementById('descClueBubble').setAttribute('aria-hidden',  String(!showDesc));
  document.getElementById('hyperClueBubble').setAttribute('aria-hidden', String(showDesc));
  activeClueType = type;
}

function closeCluePopup() {
  activeClueType = null;
  ['descClueBtn', 'hyperClueBtn'].forEach(id => {
    document.getElementById(id).classList.remove('showing-clue');
    document.getElementById(id).setAttribute('aria-expanded', 'false');
  });
  document.getElementById('descClueBubble').setAttribute('aria-hidden',  'true');
  document.getElementById('hyperClueBubble').setAttribute('aria-hidden', 'true');
}

// ═══════════════════════════════════════════════════
//  UI classic
// ═══════════════════════════════════════════════════
function showError(msg, duration = 3000) {
  const banner = document.getElementById('errorBanner');
  if (!banner) return;
  document.getElementById('errorMsg').textContent = msg;
  banner.classList.add('visible');
  if (duration < 9000) setTimeout(() => banner.classList.remove('visible'), duration);
}

function showWin() {
  document.getElementById('wonBrawlerIcon').src   = target.icon_path;
  document.getElementById('wonBrawlerIcon').alt   = target.name;
  document.getElementById('wonScore').textContent = `Score: ${attemptCount}`;
  const wonSection = document.getElementById('wonSection');
  wonSection.classList.add('visible');
  setTimeout(() => wonSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

// ═══════════════════════════════════════════════════
//  START — détection automatique de la page
// ═══════════════════════════════════════════════════
if (document.getElementById('gadgetImage') !== null) {
  initGadget();
} else if (document.getElementById('starPowerImage') !== null) {
  initStarPower();
} else if (document.getElementById('skinImage') !== null) {
  initSkin();
} else {
  init();
}

// ═══════════════════════════════════════════════════
//  MODE GADGET
// ═══════════════════════════════════════════════════
let gadgetAllBrawlers      = [];
let gadgetTarget           = null;
let gadgetGuessedIds       = new Set();
let gadgetSelectedBrawler  = null;
let gadgetGameOver         = false;
let gadgetAttemptCount     = 0;
let gadgetNameClueUnlocked = false;
let gadgetDescClueUnlocked = false;
let gadgetActiveClueType   = null;

async function initGadget() {
  try {
    gadgetAllBrawlers = await gadgetLoadBrawlers();
    gadgetTarget      = await gadgetLoadDailyTarget();
    gadgetDisplayGadget();
    gadgetSetupSearch();
    gadgetSetupClueUI();
    gadgetUpdateClueCards();
  } catch (e) {
    console.error('Gadget — erreur de chargement :', e.message);
  }
}

async function gadgetLoadBrawlers() {
  return loadActiveBrawlers();
}

async function gadgetLoadDailyTarget() {
  const today = new Date().toISOString().slice(0, 10);
  const mode = await loadGameModeConfig(GADGET_MODE_ID);
  const targetSource = resolveTargetTableForMode(GADGET_MODE_ID, mode.result_source);

  const schedule = await loadDailyScheduleEntry(GADGET_MODE_ID, today);
  if (targetSource !== 'ability') {
    throw new Error(`Le mode ${mode.name} attend une cible ability`);
  }
  const ability = await loadSingleById('ability', schedule.result_id, ABILITY_FIELDS, 'Gadget cible introuvable dans ability');
  const brawler = normalizeBrawlerRecord(
    await loadSingleById('brawler', ability.brawler_id, BRAWLER_FIELDS, `Brawler introuvable pour le gadget ${ability.name}`),
  );

  brawler.gadget = {
    id:          ability.id,
    name:        ability.name,
    image_path:  ability.image_path,
    description: ability.description,
  };
  return brawler;
}

function gadgetDisplayGadget() {
  const img = document.getElementById('gadgetImage');
  if (!img || !gadgetTarget?.gadget) return;
  img.src     = gadgetTarget.gadget.image_path;
  img.alt     = gadgetTarget.gadget.name;
  img.onerror = () => { img.removeAttribute('src'); };
}

function gadgetSetupSearch() {
  const input      = document.getElementById('searchInput');
  const dropdown   = document.getElementById('dropdown');
  const searchWrap = document.querySelector('.search-wrap');
  const chatBtn    = document.querySelector('.chat-btn');
  let timer;
  const update = () => {
    const q       = input.value.trim().toLowerCase();
    const results = gadgetAllBrawlers
      .filter(b => !gadgetGuessedIds.has(b.id) && b.name.toLowerCase().startsWith(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    if (!results.length) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = results.map(b => `
      <div class="dropdown-item" data-id="${b.id}">
        <div class="icon-wrap">
          <img src="${b.icon_path}" alt="${b.name}" onerror="this.src='${IMG_DEFAULT}'" />
        </div>
        <div class="d-name">${b.name}</div>
      </div>
    `).join('');
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        gadgetSelectedBrawler = gadgetAllBrawlers.find(b => b.id === parseInt(el.dataset.id, 10)) ?? null;
        if (!gadgetSelectedBrawler) return;
        input.value = gadgetSelectedBrawler.name;
        dropdown.classList.remove('open');
        gadgetSubmitGuess();
      });
    });
  };
  input.addEventListener('click',   () => { clearTimeout(timer); update(); });
  input.addEventListener('input',   () => { clearTimeout(timer); timer = setTimeout(update, 150); });
  input.addEventListener('keydown', e  => { if (e.key === 'Enter') gadgetSubmitGuess(); });
  chatBtn?.addEventListener('click', gadgetSubmitGuess);
  document.addEventListener('click', e => {
    if (searchWrap && !searchWrap.contains(e.target)) dropdown.classList.remove('open');
  });
}

function gadgetSubmitGuess() {
  if (gadgetGameOver) return;
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  if (!gadgetSelectedBrawler) {
    const q = input.value.trim().toLowerCase();
    gadgetSelectedBrawler = q
      ? (gadgetAllBrawlers.find(b => b.name.toLowerCase() === q && !gadgetGuessedIds.has(b.id)) ?? null)
      : null;
  }
  if (!gadgetSelectedBrawler || gadgetGuessedIds.has(gadgetSelectedBrawler.id)) return;
  input.disabled = true;
  gadgetGuessedIds.add(gadgetSelectedBrawler.id);
  gadgetAttemptCount++;
  dropdown.classList.remove('open');
  const isCorrect = gadgetSelectedBrawler.id === gadgetTarget.id;
  gadgetRenderResultRow(gadgetSelectedBrawler, isCorrect);
  gadgetUpdateClueCards();
  input.value           = '';
  gadgetSelectedBrawler = null;
  input.disabled        = false;
  input.focus();
  if (isCorrect) { gadgetGameOver = true; setTimeout(gadgetShowWin, 700); }
}

function gadgetRenderResultRow(brawler, isCorrect) {
  const list = document.getElementById('resultsList');
  list.querySelector('.empty-state')?.remove();
  const row = document.createElement('div');
  row.className = `result-row ${isCorrect ? 'correct' : 'wrong'}`;
  row.innerHTML = `
    <div class="icon-wrap">
      <img src="${brawler.icon_path}" alt="${brawler.name}" onerror="this.src='${IMG_DEFAULT}'" />
    </div>
    <span class="result-name subtitle">${brawler.name}</span>
  `;
  list.insertBefore(row, list.firstChild);
}

function gadgetSetupClueUI() {
  document.getElementById('nameClueBtn')?.addEventListener('click', () => {
    if (gadgetNameClueUnlocked) gadgetToggleCluePopup('name');
  });
  document.getElementById('descClueBtn')?.addEventListener('click', () => {
    if (gadgetDescClueUnlocked) gadgetToggleCluePopup('desc');
  });
}

function gadgetUpdateClueCards() {
  gadgetNameClueUnlocked = gadgetAttemptCount >= GADGET_NAME_CLUE_ATT;
  gadgetDescClueUnlocked = gadgetAttemptCount >= GADGET_DESC_CLUE_ATT;
  const nameRem = Math.max(0, GADGET_NAME_CLUE_ATT - gadgetAttemptCount);
  const descRem = Math.max(0, GADGET_DESC_CLUE_ATT - gadgetAttemptCount);
  document.getElementById('nameClueIcon').src = gadgetNameClueUnlocked
    ? '../assets/design/icon-clue_name.png'
    : '../assets/design/icon-clue_name_lock.png';
  document.getElementById('descClueIcon').src = gadgetDescClueUnlocked
    ? '../assets/design/icon-clue_desc.png'
    : '../assets/design/icon-clue_desc_lock.png';
  document.getElementById('nameClueBtn').classList.toggle('unlocked', gadgetNameClueUnlocked);
  document.getElementById('descClueBtn').classList.toggle('unlocked', gadgetDescClueUnlocked);
  document.getElementById('nameClueTries').textContent  = nameRem;
  document.getElementById('descClueTries').textContent  = descRem;
  document.getElementById('nameClueStatus').textContent = nameRem > 0 ? `in ${nameRem} tries` : '';
  document.getElementById('descClueStatus').textContent = descRem > 0 ? `in ${descRem} tries` : '';
  document.getElementById('cluePopupTextName').textContent = gadgetTarget?.gadget?.name        || 'Unknown';
  document.getElementById('cluePopupTextDesc').textContent = gadgetTarget?.gadget?.description || 'Unknown';
}

function gadgetToggleCluePopup(type) {
  const id   = type === 'name' ? 'nameClueBtn' : 'descClueBtn';
  const card = document.getElementById(id);
  (gadgetActiveClueType === type && card.classList.contains('showing-clue'))
    ? gadgetCloseCluePopup()
    : gadgetOpenCluePopup(type);
}

function gadgetOpenCluePopup(type) {
  const showName = type === 'name';
  document.getElementById('nameClueBtn').classList.toggle('showing-clue',  showName);
  document.getElementById('descClueBtn').classList.toggle('showing-clue', !showName);
  document.getElementById('nameClueBtn').setAttribute('aria-expanded',  String( showName));
  document.getElementById('descClueBtn').setAttribute('aria-expanded',  String(!showName));
  document.getElementById('nameClueBubble').setAttribute('aria-hidden', String(!showName));
  document.getElementById('descClueBubble').setAttribute('aria-hidden', String( showName));
  gadgetActiveClueType = type;
}

function gadgetCloseCluePopup() {
  gadgetActiveClueType = null;
  ['nameClueBtn', 'descClueBtn'].forEach(id => {
    document.getElementById(id).classList.remove('showing-clue');
    document.getElementById(id).setAttribute('aria-expanded', 'false');
  });
  document.getElementById('nameClueBubble').setAttribute('aria-hidden', 'true');
  document.getElementById('descClueBubble').setAttribute('aria-hidden', 'true');
}

function gadgetShowWin() {
  document.getElementById('wonBrawlerIcon').src         = gadgetTarget.icon_path;
  document.getElementById('wonBrawlerIcon').alt         = gadgetTarget.name;
  document.getElementById('wonBrawlerName').textContent = gadgetTarget.name;
  document.getElementById('wonScore').textContent       = `Score: ${gadgetAttemptCount}`;
  const wonSection = document.getElementById('wonSection');
  wonSection.classList.add('visible');
  setTimeout(() => wonSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

// ═══════════════════════════════════════════════════
//  MODE STAR POWER
// ═══════════════════════════════════════════════════
let spAllBrawlers      = [];
let spTarget           = null;
let spGuessedIds       = new Set();
let spSelectedBrawler  = null;
let spGameOver         = false;
let spAttemptCount     = 0;
let spNameClueUnlocked = false;
let spDescClueUnlocked = false;
let spActiveClueType   = null;

async function initStarPower() {
  try {
    spAllBrawlers = await spLoadBrawlers();
    spTarget      = await spLoadDailyTarget();
    spDisplayImage();
    spSetupSearch();
    spSetupClueUI();
    spUpdateClueCards();
  } catch (e) {
    console.error('Star Power — erreur de chargement :', e.message);
  }
}

async function spLoadBrawlers() {
  return loadActiveBrawlers();
}

async function spLoadDailyTarget() {
  const today = new Date().toISOString().slice(0, 10);
  const mode = await loadGameModeConfig(STAR_POWER_MODE_ID);
  const targetSource = resolveTargetTableForMode(STAR_POWER_MODE_ID, mode.result_source);

  const schedule = await loadDailyScheduleEntry(STAR_POWER_MODE_ID, today);
  if (targetSource !== 'ability') {
    throw new Error(`Le mode ${mode.name} attend une cible ability`);
  }
  const ability = await loadSingleById('ability', schedule.result_id, ABILITY_FIELDS, 'Star power cible introuvable dans ability');
  const brawler = normalizeBrawlerRecord(
    await loadSingleById('brawler', ability.brawler_id, BRAWLER_FIELDS, `Brawler introuvable pour le star power ${ability.name}`),
  );

  brawler.starPower = {
    id:          ability.id,
    name:        ability.name,
    image_path:  ability.image_path,
    description: ability.description,
  };
  return brawler;
}

function spDisplayImage() {
  const img = document.getElementById('starPowerImage');
  if (!img || !spTarget?.starPower) return;
  img.src     = spTarget.starPower.image_path;
  img.alt     = spTarget.starPower.name;
  img.onerror = () => { img.removeAttribute('src'); };
}

function spSetupSearch() {
  const input      = document.getElementById('searchInput');
  const dropdown   = document.getElementById('dropdown');
  const searchWrap = document.querySelector('.search-wrap');
  const chatBtn    = document.querySelector('.chat-btn');
  let timer;
  const update = () => {
    const q       = input.value.trim().toLowerCase();
    const results = spAllBrawlers
      .filter(b => !spGuessedIds.has(b.id) && b.name.toLowerCase().startsWith(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    if (!results.length) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = results.map(b => `
      <div class="dropdown-item" data-id="${b.id}">
        <div class="icon-wrap">
          <img src="${b.icon_path}" alt="${b.name}" onerror="this.src='${IMG_DEFAULT}'" />
        </div>
        <div class="d-name">${b.name}</div>
      </div>
    `).join('');
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        spSelectedBrawler = spAllBrawlers.find(b => b.id === parseInt(el.dataset.id, 10)) ?? null;
        if (!spSelectedBrawler) return;
        input.value = spSelectedBrawler.name;
        dropdown.classList.remove('open');
        spSubmitGuess();
      });
    });
  };
  input.addEventListener('click',   () => { clearTimeout(timer); update(); });
  input.addEventListener('input',   () => { clearTimeout(timer); timer = setTimeout(update, 150); });
  input.addEventListener('keydown', e  => { if (e.key === 'Enter') spSubmitGuess(); });
  chatBtn?.addEventListener('click', spSubmitGuess);
  document.addEventListener('click', e => {
    if (searchWrap && !searchWrap.contains(e.target)) dropdown.classList.remove('open');
  });
}

function spSubmitGuess() {
  if (spGameOver) return;
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  if (!spSelectedBrawler) {
    const q = input.value.trim().toLowerCase();
    spSelectedBrawler = q
      ? (spAllBrawlers.find(b => b.name.toLowerCase() === q && !spGuessedIds.has(b.id)) ?? null)
      : null;
  }
  if (!spSelectedBrawler || spGuessedIds.has(spSelectedBrawler.id)) return;
  input.disabled = true;
  spGuessedIds.add(spSelectedBrawler.id);
  spAttemptCount++;
  dropdown.classList.remove('open');
  const isCorrect = spSelectedBrawler.id === spTarget.id;
  spRenderResultRow(spSelectedBrawler, isCorrect);
  spUpdateClueCards();
  input.value       = '';
  spSelectedBrawler = null;
  input.disabled    = false;
  input.focus();
  if (isCorrect) { spGameOver = true; setTimeout(spShowWin, 700); }
}

function spRenderResultRow(brawler, isCorrect) {
  const list = document.getElementById('resultsList');
  list.querySelector('.empty-state')?.remove();
  const row = document.createElement('div');
  row.className = `result-row ${isCorrect ? 'correct' : 'wrong'}`;
  row.innerHTML = `
    <div class="icon-wrap">
      <img src="${brawler.icon_path}" alt="${brawler.name}" onerror="this.src='${IMG_DEFAULT}'" />
    </div>
    <span class="result-name subtitle">${brawler.name}</span>
  `;
  list.insertBefore(row, list.firstChild);
}

function spSetupClueUI() {
  document.getElementById('nameClueBtn')?.addEventListener('click', () => {
    if (spNameClueUnlocked) spToggleCluePopup('name');
  });
  document.getElementById('descClueBtn')?.addEventListener('click', () => {
    if (spDescClueUnlocked) spToggleCluePopup('desc');
  });
}

function spUpdateClueCards() {
  spNameClueUnlocked = spAttemptCount >= SP_NAME_CLUE_ATT;
  spDescClueUnlocked = spAttemptCount >= SP_DESC_CLUE_ATT;
  const nameRem = Math.max(0, SP_NAME_CLUE_ATT - spAttemptCount);
  const descRem = Math.max(0, SP_DESC_CLUE_ATT - spAttemptCount);
  document.getElementById('nameClueIcon').src = spNameClueUnlocked
    ? '../assets/design/icon-clue_name.png'
    : '../assets/design/icon-clue_name_lock.png';
  document.getElementById('descClueIcon').src = spDescClueUnlocked
    ? '../assets/design/icon-clue_desc.png'
    : '../assets/design/icon-clue_desc_lock.png';
  document.getElementById('nameClueBtn').classList.toggle('unlocked', spNameClueUnlocked);
  document.getElementById('descClueBtn').classList.toggle('unlocked', spDescClueUnlocked);
  document.getElementById('nameClueTries').textContent  = nameRem;
  document.getElementById('descClueTries').textContent  = descRem;
  document.getElementById('nameClueStatus').textContent = nameRem > 0 ? `in ${nameRem} tries` : '';
  document.getElementById('descClueStatus').textContent = descRem > 0 ? `in ${descRem} tries` : '';
  // Name clue = nom du star power cible
  document.getElementById('cluePopupTextName').textContent = spTarget.starPower.name || 'Unknown';
  // Desc clue = description du star power (depuis ability)
  document.getElementById('cluePopupTextDesc').textContent = spTarget?.starPower?.description || 'Unknown';
}

function spToggleCluePopup(type) {
  const id   = type === 'name' ? 'nameClueBtn' : 'descClueBtn';
  const card = document.getElementById(id);
  (spActiveClueType === type && card.classList.contains('showing-clue'))
    ? spCloseCluePopup()
    : spOpenCluePopup(type);
}

function spOpenCluePopup(type) {
  const showName = type === 'name';
  document.getElementById('nameClueBtn').classList.toggle('showing-clue',  showName);
  document.getElementById('descClueBtn').classList.toggle('showing-clue', !showName);
  document.getElementById('nameClueBtn').setAttribute('aria-expanded',  String( showName));
  document.getElementById('descClueBtn').setAttribute('aria-expanded',  String(!showName));
  document.getElementById('nameClueBubble').setAttribute('aria-hidden', String(!showName));
  document.getElementById('descClueBubble').setAttribute('aria-hidden', String( showName));
  spActiveClueType = type;
}

function spCloseCluePopup() {
  spActiveClueType = null;
  ['nameClueBtn', 'descClueBtn'].forEach(id => {
    document.getElementById(id).classList.remove('showing-clue');
    document.getElementById(id).setAttribute('aria-expanded', 'false');
  });
  document.getElementById('nameClueBubble').setAttribute('aria-hidden', 'true');
  document.getElementById('descClueBubble').setAttribute('aria-hidden', 'true');
}

function spShowWin() {
  document.getElementById('wonBrawlerIcon').src         = spTarget.icon_path;
  document.getElementById('wonBrawlerIcon').alt         = spTarget.name;
  document.getElementById('wonBrawlerName').textContent = spTarget.name;
  document.getElementById('wonScore').textContent       = `Score: ${spAttemptCount}`;
  const wonSection = document.getElementById('wonSection');
  wonSection.classList.add('visible');
  setTimeout(() => wonSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

// ═══════════════════════════════════════════════════
//  MODE SKIN
// ═══════════════════════════════════════════════════
// Niveaux de blur en px — index = nombre de mauvais guesses
const SKIN_BLUR_LEVELS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 0];

let skinAllBrawlers     = [];
let skinTarget          = null;
let skinGuessedIds      = new Set();
let skinSelectedBrawler = null;
let skinGameOver        = false;
let skinAttemptCount    = 0;

async function initSkin() {
  try {
    skinAllBrawlers = await skinLoadBrawlers();
    skinTarget      = await skinLoadDailyTarget();
    skinDisplayImage();
    skinSetupSearch();
    skinUpdateBlur();
  } catch (e) {
    console.error('Skin — erreur de chargement :', e.message);
  }
}

async function skinLoadBrawlers() {
  return loadActiveBrawlers();
}

async function skinLoadDailyTarget() {
  const today = new Date().toISOString().slice(0, 10);
  const mode = await loadGameModeConfig(SKIN_MODE_ID);
  const targetSource = resolveTargetTableForMode(SKIN_MODE_ID, mode.result_source);

  const schedule = await loadDailyScheduleEntry(SKIN_MODE_ID, today);
  if (targetSource !== 'skin') {
    throw new Error(`Le mode ${mode.name} attend une cible skin`);
  }
  const skin = await loadSingleById('skin', schedule.result_id, SKIN_FIELDS, 'Skin cible introuvable dans skin');
  const brawler = normalizeBrawlerRecord(
    await loadSingleById('brawler', skin.brawler_id, BRAWLER_FIELDS, `Brawler introuvable pour le skin ${skin.name}`),
  );

  brawler.skin = {
    id:         skin.id,
    name:       skin.name,
    image_path: skin.image_path,
  };
  return brawler;
}

function skinDisplayImage() {
  const img = document.getElementById('skinImage');
  if (!img || !skinTarget?.skin) return;
  img.src     = skinTarget.skin.image_path;
  img.alt     = skinTarget.skin.name;
  img.onerror = () => { img.removeAttribute('src'); };
}

// Met à jour le blur CSS et le compteur de guesses
function skinUpdateBlur() {
  const frame = document.querySelector('.skin-frame');
  const counter = document.getElementById('skinGuessCount');
  const blurPx = SKIN_BLUR_LEVELS[Math.min(skinAttemptCount, SKIN_BLUR_LEVELS.length - 1)];

  if (frame) frame.style.setProperty('--skin-blur', `${blurPx}px`);
  if (counter) counter.textContent = `${skinAttemptCount} / ${SKIN_BLUR_LEVELS.length - 1} guesses`;
}

function skinSetupSearch() {
  const input      = document.getElementById('searchInput');
  const dropdown   = document.getElementById('dropdown');
  const searchWrap = document.querySelector('.search-wrap');
  const chatBtn    = document.querySelector('.chat-btn');
  let timer;

  const update = () => {
    const q       = input.value.trim().toLowerCase();
    const results = skinAllBrawlers
      .filter(b => !skinGuessedIds.has(b.id) && b.name.toLowerCase().startsWith(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

    if (!results.length) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }

    dropdown.innerHTML = results.map(b => `
      <div class="dropdown-item" data-id="${b.id}">
        <div class="icon-wrap">
          <img src="${b.icon_path}" alt="${b.name}" onerror="this.src='${IMG_DEFAULT}'" />
        </div>
        <div class="d-name">${b.name}</div>
      </div>
    `).join('');
    dropdown.classList.add('open');

    dropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        skinSelectedBrawler = skinAllBrawlers.find(b => b.id === parseInt(el.dataset.id, 10)) ?? null;
        if (!skinSelectedBrawler) return;
        input.value = skinSelectedBrawler.name;
        dropdown.classList.remove('open');
        skinSubmitGuess();
      });
    });
  };

  input.addEventListener('click',   () => { clearTimeout(timer); update(); });
  input.addEventListener('input',   () => { clearTimeout(timer); timer = setTimeout(update, 150); });
  input.addEventListener('keydown', e  => { if (e.key === 'Enter') skinSubmitGuess(); });
  chatBtn?.addEventListener('click', skinSubmitGuess);
  document.addEventListener('click', e => {
    if (searchWrap && !searchWrap.contains(e.target)) dropdown.classList.remove('open');
  });
}

function skinSubmitGuess() {
  if (skinGameOver) return;

  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');

  if (!skinSelectedBrawler) {
    const q = input.value.trim().toLowerCase();
    skinSelectedBrawler = q
      ? (skinAllBrawlers.find(b => b.name.toLowerCase() === q && !skinGuessedIds.has(b.id)) ?? null)
      : null;
  }
  if (!skinSelectedBrawler || skinGuessedIds.has(skinSelectedBrawler.id)) return;

  input.disabled = true;
  skinGuessedIds.add(skinSelectedBrawler.id);
  skinAttemptCount++;
  dropdown.classList.remove('open');

  const isCorrect = skinSelectedBrawler.id === skinTarget.id;
  skinRenderResultRow(skinSelectedBrawler, isCorrect);
  skinUpdateBlur();

  input.value         = '';
  skinSelectedBrawler = null;
  input.disabled      = false;
  input.focus();

  if (isCorrect) { skinGameOver = true; setTimeout(skinShowWin, 700); }
}

function skinRenderResultRow(brawler, isCorrect) {
  const list = document.getElementById('resultsList');
  list.querySelector('.empty-state')?.remove();
  const row = document.createElement('div');
  row.className = `result-row ${isCorrect ? 'correct' : 'wrong'}`;
  row.innerHTML = `
    <div class="icon-wrap">
      <img src="${brawler.icon_path}" alt="${brawler.name}" onerror="this.src='${IMG_DEFAULT}'" />
    </div>
    <span class="result-name subtitle">${brawler.name}</span>
  `;
  list.insertBefore(row, list.firstChild);
}

function skinShowWin() {
  // Retirer complètement le blur avant d'afficher la victoire
  const frame = document.querySelector('.skin-frame');
  if (frame) frame.style.setProperty('--skin-blur', '0px');

  document.getElementById('wonBrawlerIcon').src         = skinTarget.icon_path;
  document.getElementById('wonBrawlerIcon').alt         = skinTarget.name;
  document.getElementById('wonBrawlerName').textContent = skinTarget.name;
  document.getElementById('wonScore').textContent       = `Score: ${skinAttemptCount}`;
  const wonSection = document.getElementById('wonSection');
  wonSection.classList.add('visible');
  setTimeout(() => wonSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}