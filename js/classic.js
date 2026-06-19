const SUPABASE_URL = 'https://szvogkodnqqkkkzbiihd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo';
const BRAWLERS_TABLE = 'brawlers';
const DAILY_SCHEDULE_TABLE = 'daily_schedule';
const CLASSIC_MODE_ID = 1;
const BASE_URL = SUPABASE_URL.replace(/\/+$/, '');
const IMG_BASE = '../assets/brawlers/';
const IMG_DEFAULT = IMG_BASE + 'default.png';
const HYPERCHARGE_BASE = '../';
const RELEASE_ARROW_ICON = '../assets/design/arrow-icon.png';
const DESC_CLUE_UNLOCK_ATTEMPTS = 4;
const HYPER_CLUE_UNLOCK_ATTEMPTS = 6;

let allBrawlers = [];
let target = null;
let guessedIds = new Set();
let selectedBrawler = null;
let gameOver = false;
let attemptCount = 0;
let descClueUnlocked = false;
let hyperClueUnlocked = false;
let activeClueType = null;

async function init() {
  try {
    allBrawlers = await loadBrawlers();

    target = await loadDailyTarget();
    setupSearch();
    setupClueUI();
    attachHyperchargeImageFallback();
    updateClueCards();

  } catch (e) {
    showError('Erreur de chargement : ' + e.message, 9999);
  }
}

async function loadBrawlers() {
  return await loadBrawlersFromSupabase();
}

async function loadBrawlersFromSupabase() {
  const url = new URL(`${BASE_URL}/rest/v1/${BRAWLERS_TABLE}`);
  url.searchParams.set('select', [
    'id',
    'name',
    'icon_path',
    'gender',
    'rarity',
    'class',
    'attack_range',
    'movement',
    'release_year',
    'description',
    'hypercharge_name',
    'hypercharge_image_path',
    'is_active',
  ].join(','));
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('order', 'id.asc');

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Impossible de charger les brawlers depuis Supabase (${res.status}): ${details}`);
  }

  const data = await res.json();
  return data.map(normalizeBrawlerRecord);
}

async function loadDailyTarget() {
  const today = new Date().toISOString().slice(0, 10);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  // 1) Lire la ligne du jour dans daily_schedule (mode classic = 1)
  const schedRes = await fetch(
    `${BASE_URL}/rest/v1/${DAILY_SCHEDULE_TABLE}?play_date=eq.${today}&mode_id=eq.${CLASSIC_MODE_ID}&select=result_id&limit=1`,
    { headers }
  );
  if (!schedRes.ok) {
    const details = await schedRes.text();
    throw new Error(`Impossible de charger le planning du jour (${schedRes.status}): ${details}`);
  }
  const schedule = await schedRes.json();
  if (!Array.isArray(schedule) || !schedule.length || schedule[0].result_id == null) {
    throw new Error('Aucun brawler defini pour aujourd\'hui dans daily_schedule');
  }
  const resultId = schedule[0].result_id;

  // 2) Charger le brawler cible depuis la table brawlers via son id
  const brawlerRes = await fetch(
    `${BASE_URL}/rest/v1/${BRAWLERS_TABLE}?id=eq.${resultId}&select=id,name,icon_path,gender,rarity,class,attack_range,movement,release_year,description,hypercharge_name,hypercharge_image_path&limit=1`,
    { headers }
  );
  if (!brawlerRes.ok) {
    const details = await brawlerRes.text();
    throw new Error(`Impossible de charger le brawler cible (${brawlerRes.status}): ${details}`);
  }
  const rows = await brawlerRes.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`Brawler cible introuvable (id=${resultId})`);
  }
  return normalizeBrawlerRecord(rows[0]);
}

function normalizeBrawlerRecord(record) {
  if (!record) return record;

  return {
    id: Number(record.id),
    name: record.name,
    gender: record.gender,
    rarity: record.rarity,
    role: record.role ?? record.class,
    attack_range: record.attack_range,
    movement: record.movement,
    release_year: Number(record.release_year),
    icon_path: record.icon_path,
    description: record.description,
    hypercharge_path: record.hypercharge_path ?? record.hypercharge_image_path,
    hypercharge_name: record.hypercharge_name,
  };
}

function formatLabel(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).replace(/_/g, ' ');
  return text
    .split(' ')
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function resolveAssetPath(path, base) {
  if (!path) return '';

  const normalized = String(path).trim().replace(/^\/+/, '');
  if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('data:')) {
    return normalized;
  }

  if (normalized.startsWith('../') || normalized.startsWith('./')) {
    return normalized;
  }

  if (normalized.startsWith('assets/')) {
    return `../${normalized}`;
  }

  return `${base}${normalized}`;
}

function showError(msg, duration = 3000) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMsg').textContent = msg;
  banner.classList.add('visible');
  if (duration < 9000) {
    setTimeout(() => banner.classList.remove('visible'), duration);
  }
}

function iconSrc(path) {
  return resolveAssetPath(path, IMG_BASE) || IMG_DEFAULT;
}

function getAutocompleteResults(query) {
  const normalizedQuery = query.trim().toLowerCase();

  return allBrawlers
    .filter(brawler => !guessedIds.has(brawler.id))
    .filter(brawler => brawler.name.toLowerCase().startsWith(normalizedQuery))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

function renderAutocomplete(results, dropdown, input) {
  if (!results.length) {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    return;
  }

  dropdown.innerHTML = results.map(brawler => `
    <div class="dropdown-item" data-id="${brawler.id}">
      <div class="icon-wrap">
        <img src="${iconSrc(brawler.icon_path)}" alt="${brawler.name}"
             onerror="this.src='${IMG_DEFAULT}'" />
      </div>
      <div>
        <div class="d-name">${brawler.name}</div>
      </div>
    </div>
  `).join('');

  dropdown.classList.add('open');

  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    const id = parseInt(el.dataset.id, 10);
    el.addEventListener('click', () => {
      selectedBrawler = allBrawlers.find(brawler => brawler.id === id) || null;
      if (!selectedBrawler) return;

      input.value = selectedBrawler.name;
      dropdown.classList.remove('open');
      submitGuess();
    });
  });
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  const searchWrap = document.querySelector('.search-wrap');
  const chatBtn = document.querySelector('.chat-btn');

  let timer;

  const updateDropdown = () => {
    const results = getAutocompleteResults(input.value);
    renderAutocomplete(results, dropdown, input);
  };

  input.addEventListener('click', () => {
    clearTimeout(timer);
    updateDropdown();
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(updateDropdown, 150);
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });

  if (chatBtn) {
    chatBtn.addEventListener('click', submitGuess);
  }

  document.addEventListener('click', (e) => {
    if (searchWrap && !searchWrap.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
}

function submitGuess() {
  if (gameOver) return;

  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');

  if (!selectedBrawler) {
    const rawName = input.value.trim().toLowerCase();
    if (rawName) {
      selectedBrawler = allBrawlers.find(
        b => b.name.toLowerCase() === rawName && !guessedIds.has(b.id)
      ) || null;
    }
  }

  if (!selectedBrawler) {
    return;
  }

  if (guessedIds.has(selectedBrawler.id)) {
    return;
  }

  input.disabled = true;

  guessedIds.add(selectedBrawler.id);
  attemptCount++;
  dropdown.classList.remove('open');

  const result = computeResult(selectedBrawler, target);
  renderRow(selectedBrawler, result);
  updateClueCards();

  input.value = '';
  selectedBrawler = null;
  input.disabled = false;
  input.focus();

  if (result.correct) {
    gameOver = true;
    setTimeout(() => showWin(), 700);
  }
}

function setupClueUI() {
  const descBtn = document.getElementById('descClueBtn');
  const hyperBtn = document.getElementById('hyperClueBtn');

  descBtn.addEventListener('click', () => {
    if (!descClueUnlocked) return;
    toggleCluePopup('desc');
  });

  hyperBtn.addEventListener('click', () => {
    if (!hyperClueUnlocked) return;
    toggleCluePopup('hyper');
  });
}

function remainingClueTries(type) {
  const threshold = type === 'desc' ? DESC_CLUE_UNLOCK_ATTEMPTS : HYPER_CLUE_UNLOCK_ATTEMPTS;
  return Math.max(0, threshold - attemptCount);
}

function updateClueCards() {
  descClueUnlocked = attemptCount >= DESC_CLUE_UNLOCK_ATTEMPTS;
  hyperClueUnlocked = attemptCount >= HYPER_CLUE_UNLOCK_ATTEMPTS;

  const descCard = document.getElementById('descClueBtn');
  const hyperCard = document.getElementById('hyperClueBtn');
  const descIcon = document.getElementById('descClueIcon');
  const hyperIcon = document.getElementById('hyperClueIcon');
  const descTries = document.getElementById('descClueTries');
  const hyperTries = document.getElementById('hyperClueTries');
  const descStatus = document.getElementById('descClueStatus');
  const hyperStatus = document.getElementById('hyperClueStatus');
  const descBubbleText = document.getElementById('cluePopupTextDesc');
  const hyperBubbleImage = document.getElementById('cluePopupHyperImage');
  const hyperBubbleText = document.getElementById('cluePopupTextHyper');
  const descRemaining = remainingClueTries('desc');
  const hyperRemaining = remainingClueTries('hyper');

  descIcon.src = descClueUnlocked
    ? '../assets/design/icon-clue_desc.png'
    : '../assets/design/icon-clue_desc_lock.png';
  hyperIcon.src = hyperClueUnlocked
    ? '../assets/design/icon-clue_hypercharge.png'
    : '../assets/design/icon-clue_hypercharge_lock.png';

  descCard.classList.toggle('unlocked', descClueUnlocked);
  hyperCard.classList.toggle('unlocked', hyperClueUnlocked);

  descTries.textContent = descRemaining;
  hyperTries.textContent = hyperRemaining;

  descStatus.textContent = descRemaining > 0 ? `in ${descRemaining} tries` : '';
  hyperStatus.textContent = hyperRemaining > 0 ? `in ${hyperRemaining} tries` : '';

  descBubbleText.textContent = getDescriptionClue(target);
  refreshHyperchargeClue();
}

function toggleCluePopup(type) {
  const card = type === 'desc'
    ? document.getElementById('descClueBtn')
    : document.getElementById('hyperClueBtn');
  const isSameClue = activeClueType === type;

  if (isSameClue && card.classList.contains('showing-clue')) {
    closeCluePopup();
    return;
  }

  openCluePopup(type);
}

function openCluePopup(type) {
  const descCard = document.getElementById('descClueBtn');
  const hyperCard = document.getElementById('hyperClueBtn');
  const showDesc = type === 'desc';

  descCard.classList.toggle('showing-clue', showDesc);
  hyperCard.classList.toggle('showing-clue', !showDesc);
  descCard.setAttribute('aria-expanded', showDesc ? 'true' : 'false');
  hyperCard.setAttribute('aria-expanded', showDesc ? 'false' : 'true');
  document.getElementById('descClueBubble').setAttribute('aria-hidden', showDesc ? 'false' : 'true');
  document.getElementById('hyperClueBubble').setAttribute('aria-hidden', showDesc ? 'true' : 'false');

  activeClueType = type;
}

function closeCluePopup() {
  activeClueType = null;
  const descCard = document.getElementById('descClueBtn');
  const hyperCard = document.getElementById('hyperClueBtn');

  descCard.classList.remove('showing-clue');
  hyperCard.classList.remove('showing-clue');
  descCard.setAttribute('aria-expanded', 'false');
  hyperCard.setAttribute('aria-expanded', 'false');
  document.getElementById('descClueBubble').setAttribute('aria-hidden', 'true');
  document.getElementById('hyperClueBubble').setAttribute('aria-hidden', 'true');
}

function getDescriptionClue(brawler) {
  if (!brawler) return 'unknown';
  if (typeof brawler.description === 'string' && brawler.description.trim()) {
    return brawler.description.trim();
  }
  return 'unknown';
}

function getHyperchargeImageSrc(brawler) {
  if (!brawler || typeof brawler.hypercharge_path !== 'string' || !brawler.hypercharge_path.trim()) {
    return '';
  }
  const path = brawler.hypercharge_path.trim();
  const hasImageExt = /\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(path);
  if (!hasImageExt) {
    return '';
  }
  return resolveAssetPath(path, HYPERCHARGE_BASE);
}

function attachHyperchargeImageFallback() {
  const img = document.getElementById('cluePopupHyperImage');
  if (!img) return;
  img.addEventListener('error', () => {
    img.removeAttribute('src');
    img.style.display = 'none';
  });
}

function refreshHyperchargeClue() {
  const img = document.getElementById('cluePopupHyperImage');
  const text = document.getElementById('cluePopupTextHyper');
  if (!img || !text) return;

  const src = getHyperchargeImageSrc(target);
  if (src) {
    img.style.display = '';
    img.removeAttribute('data-failed');
    if (img.getAttribute('src') !== src) {
      img.src = src;
    }
    img.alt = target ? `${target.name} hypercharge` : 'Hypercharge du brawler';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
  text.textContent = getHyperchargeNameClue(target);
}

function getHyperchargeNameClue(brawler) {
  if (!brawler) return 'unknown';
  if (typeof brawler.hypercharge_name === 'string' && brawler.hypercharge_name.trim()) {
    return brawler.hypercharge_name.trim();
  }
  return 'unknown';
}

function computeResult(guess, tgt) {
  const yearDiff = guess.release_year - tgt.release_year;
  const yearHint = yearDiff === 0 ? 'correct' : yearDiff < 0 ? 'higher' : 'lower';

  return {
    correct: guess.id === tgt.id,
    gender: guess.gender === tgt.gender ? 'correct' : 'wrong',
    rarity: guess.rarity === tgt.rarity ? 'correct' : 'wrong',
    role: guess.role === tgt.role ? 'correct' : 'wrong',
    range: guess.attack_range === tgt.attack_range ? 'correct' : 'wrong',
    movement: guess.movement === tgt.movement ? 'correct' : 'wrong',
    year: yearHint,
  };
}

function renderRow(brawler, result) {
  const list = document.getElementById('guessesList');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const releaseArrow = result.year === 'correct'
    ? ''
    : `<img class="release-arrow ${result.year === 'lower' ? 'is-down' : ''}" src="${RELEASE_ARROW_ICON}" alt="" aria-hidden="true" />`;

  const nameClass = result.correct ? 'cell-correct' : 'cell-wrong';

  const row = document.createElement('div');
  row.className = 'guess-row';
  row.innerHTML = `
    <div class="cell ${nameClass} cell-name">
      <div class="icon-wrap">
        <img src="${iconSrc(brawler.icon_path)}" alt="${brawler.name}"
             onerror="this.src='${IMG_DEFAULT}'" />
      </div>
    </div>
    <div class="cell ${result.gender === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.gender)}</div>
    <div class="cell ${result.rarity === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.rarity)}</div>
    <div class="cell ${result.role === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.role)}</div>
    <div class="cell ${result.range === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.attack_range)}</div>
    <div class="cell ${result.movement === 'correct' ? 'cell-correct' : 'cell-wrong'}">${formatLabel(brawler.movement)}</div>
    <div class="cell ${result.year === 'correct' ? 'cell-correct' : 'cell-wrong'}">
      <span class="release-year-wrap">${brawler.release_year}${releaseArrow}</span>
    </div>
  `;

  list.insertBefore(row, list.firstChild);
}

function showWin() {
  const wonSection = document.getElementById('wonSection');
  const wonBrawlerIcon = document.getElementById('wonBrawlerIcon');
  const wonScore = document.getElementById('wonScore');

  wonBrawlerIcon.src = iconSrc(target.icon_path);
  wonBrawlerIcon.alt = target.name;
  document.getElementById('wonBrawlerName').textContent = target.name;
  wonScore.textContent = `Score: ${attemptCount}`;

  wonSection.classList.add('visible');

  setTimeout(() => {
    wonSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
}

init();
