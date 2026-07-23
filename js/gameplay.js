const SUPABASE_URL      = 'https://szvogkodnqqkkkzbiihd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo';
const CLASSIC_MODE_ID   = 1;
const GADGET_MODE_ID    = 2;

const IMG_DEFAULT        = '../assets/brawlers/default.png';
const RELEASE_ARROW_ICON = '../assets/design/arrow-icon.png';

const DESC_CLUE_UNLOCK_ATTEMPTS  = 4;
const HYPER_CLUE_UNLOCK_ATTEMPTS = 6;
const GADGET_NAME_CLUE_ATT       = 4;
const GADGET_DESC_CLUE_ATT       = 6;

// hypercharge_name et hypercharge_image_path supprimés — maintenant dans abilities
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
//  SUPABASE — helper SELECT centralisé
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
//  INIT — chargements en parallèle
// ═══════════════════════════════════════════════════
async function init() {
  try {
    [allBrawlers, target] = await Promise.all([loadBrawlers(), loadDailyTarget()]);
    setupSearch();
    setupClueUI();
    updateClueCards();
  } catch (e) {
    showError('Erreur de chargement : ' + e.message, 9999);
  }
}

// ═══════════════════════════════════════════════════
//  CHARGEMENT DONNÉES — SELECT uniquement
// ═══════════════════════════════════════════════════
async function loadBrawlers() {
  const rows = await supabaseFetch('brawlers', {
    select:    BRAWLER_FIELDS,
    is_active: 'eq.true',
    order:     'name.asc',
  });
  return rows.map(normalizeBrawlerRecord);
}

async function loadDailyTarget() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Brawler cible via daily_schedule JOIN brawlers
  const rows = await supabaseFetch('daily_schedule', {
    select:    `brawlers!result_id(${BRAWLER_FIELDS})`,
    play_date: `eq.${today}`,
    mode_id:   `eq.${CLASSIC_MODE_ID}`,
    limit:     '1',
  });

  if (!rows.length || !rows[0].brawlers) {
    throw new Error(`Aucun brawler configuré pour le mode Classic du ${today}`);
  }

  const brawler = normalizeBrawlerRecord(rows[0].brawlers);

  // 2. Hypercharge via abilities (type = 'hypercharge', slot 1)
  const abilities = await supabaseFetch('abilities', {
    select:     'id,name,image_path,description',
    brawler_id: `eq.${brawler.id}`,
    type:       'eq.hypercharge',
    limit:      '1',
  });

  if (!abilities.length) {
    console.warn(`Aucune hypercharge trouvée pour le brawler cible ${brawler.name} (id=${brawler.id})`);
  }

  brawler.hypercharge = abilities.length ? abilities[0] : null;
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
//  AUTOCOMPLETE
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
//  GUESS
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
//  GAME LOGIC
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
//  CLUE SYSTEM — classic
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

  // Indice description
  document.getElementById('cluePopupTextDesc').textContent =
    target?.description?.trim() || 'Unknown';

  // Indice hypercharge — image_path et name viennent maintenant de abilities
  const hyperImg  = document.getElementById('cluePopupHyperImage');
  const hyperText = document.getElementById('cluePopupTextHyper');
  if (hyperImg) {
    hyperImg.src          = target?.hypercharge?.image_path || '';
    hyperImg.alt          = target?.hypercharge?.name       || '';
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
//  UI
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

// Brawlers pour l'autocomplete — mêmes champs, réutilise supabaseFetch
async function gadgetLoadBrawlers() {
  const rows = await supabaseFetch('brawlers', {
    select:    BRAWLER_FIELDS,
    is_active: 'eq.true',
    order:     'name.asc',
  });
  return rows.map(normalizeBrawlerRecord);
}

// result_id pointe vers abilities.id (un gadget précis) pour le mode gadget
async function gadgetLoadDailyTarget() {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Récupérer l'ID de l'ability (gadget) du jour
  const schedule = await supabaseFetch('daily_schedule', {
    select:    'result_id',
    play_date: `eq.${today}`,
    mode_id:   `eq.${GADGET_MODE_ID}`,
    limit:     '1',
  });

  if (!schedule.length || schedule[0].result_id == null) {
    throw new Error(`Aucun gadget défini pour le mode Gadget du ${today}`);
  }

  // 2. Charger l'ability + le brawler associé via JOIN
  const rows = await supabaseFetch('abilities', {
    select: `id,name,image_path,description,brawlers!brawler_id(${BRAWLER_FIELDS})`,
    brawler_id:     `eq.${schedule[0].result_id}`,
    type:  'eq.gadget',
    limit:  '1',
  });
  if (!rows.length || !rows[0].brawlers) {
    throw new Error('Gadget cible introuvable dans abilities');
  }

  const ability = rows[0];
  const brawler = normalizeBrawlerRecord(ability.brawlers);

  // Attacher le gadget du jour directement sur l'objet brawler
  brawler.gadget = {
    id:          ability.id,
    name:        ability.name,
    image_path:  ability.image_path,
    description: ability.description,
  };

  return brawler;
}

// Affiche l'image du gadget (chemin stocké dans abilities.image_path)
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

  // Name clue = nom du brawler cible
  document.getElementById('cluePopupTextName').textContent =
    gadgetTarget.gadget.name || 'Unknown';
  // Desc clue = description du gadget (depuis abilities)
  document.getElementById('cluePopupTextDesc').textContent =
    gadgetTarget.gadget.description || 'Unknown';
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