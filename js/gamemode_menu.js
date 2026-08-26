const RESET_LABEL = Utils.getTimeUntilMidnight();
const SUPABASE_URL = 'https://szvogkodnqqkkkzbiihd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo';

async function fetchRows(table, params) {
  var url = new URL(SUPABASE_URL + '/rest/v1/' + table);
  Object.keys(params).forEach(function(key) {
    url.searchParams.set(key, params[key]);
  });

  var response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function normalizeModeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function getModePage(name) {
  var pageName = normalizeModeName(name);
  return pageName + '.html';
}

function createModeCard(cfg, options, index) {
  var href     = cfg.href     || '#';
  var onInfoClick = options && typeof options.onInfoClick === 'function' ? options.onInfoClick : null;

  var wrap = document.createElement('div');
  wrap.className = 'mode-card-wrap';

  var card = document.createElement('a');
  card.href = href;
  card.className = 'mode-card';

  var menuDiv = document.createElement('div');
  menuDiv.style.position = 'relative';
  menuDiv.style.width = '100%';
  menuDiv.style.height = 'auto';

  var imgMenu = document.createElement('img');
  imgMenu.src = cfg.modeImage || '../assets/gamemode/default.png';
  imgMenu.alt = 'Menu Default';
  imgMenu.style.width = '100%';
  imgMenu.style.height = 'auto';
  imgMenu.style.display = 'block';
  menuDiv.appendChild(imgMenu);

  var imgInfo = document.createElement('img');
  imgInfo.src = '../assets/gamemode/info_button.png';
  imgInfo.alt = 'Info';
  imgInfo.className = 'info-button';
  imgInfo.style.position = 'absolute';
  imgInfo.style.top = '-4px';
  imgInfo.style.right = '-8px';
  imgInfo.style.width = '40px';
  imgInfo.style.height = '40px';
  imgInfo.style.cursor = 'pointer';
  menuDiv.appendChild(imgInfo);

  var resetSpan = document.createElement('span');
  resetSpan.textContent = "Reset in: " + RESET_LABEL;
  resetSpan.style.position = 'absolute';
  resetSpan.style.top = '2px';
  resetSpan.style.right = '45px';
  resetSpan.style.color = '#7583a4';
  resetSpan.style.fontFamily = "'Lilita One', cursive";
  resetSpan.style.fontSize = '20px';
  resetSpan.style.fontWeight = 'normal';
  menuDiv.appendChild(resetSpan);

  card.appendChild(menuDiv);

  if (cfg.labelImage) {
    var underDiv = document.createElement('div');
    underDiv.style.position = 'relative';
    underDiv.style.width = '100%';
    underDiv.style.height = 'auto';
    underDiv.style.marginTop = '-20px';
    underDiv.style.display = 'flex';
    underDiv.style.justifyContent = 'center';
    underDiv.style.alignItems = 'flex-end';
    var imgUnder = document.createElement('img');
    imgUnder.src = cfg.labelImage;
    imgUnder.alt = 'Label du mode';
    imgUnder.style.width = '75%';
    imgUnder.style.height = 'auto';
    underDiv.appendChild(imgUnder);
    card.appendChild(underDiv);
  }

  wrap.appendChild(card);

  imgInfo.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (onInfoClick) {
      onInfoClick({ index: index });
    }
  });

  return wrap;
}
function initMenuCards(gridSelector, cards, options) {
  var grid = document.querySelector(gridSelector);
  if (!grid) return;
  for (var i = 0; i < cards.length; i++) {
    var wrap = createModeCard(cards[i], options || {}, i);
    grid.appendChild(wrap);
  }
}
var infoPanel = document.getElementById('gamemodeInfoPanel');
  var infoImage = infoPanel.querySelector('.gamemode-info-image');
  var infoClose = document.getElementById('gamemodeInfoClose');
  var modesGrid = document.getElementById('modesGrid');
  var modesPrevBtn = document.getElementById('modesPrevBtn');
  var modesNextBtn = document.getElementById('modesNextBtn');

  var activeInfoIndex = -1;
  var currentPage = 0;
  var isPaging = false;
  var PAGE_ANIM_OUT_MS = 130;
  var PAGE_ANIM_IN_MS = 170;
  var rowsPerPage = 2;
  var cardsData = [
    {
      href: 'classic.html',
      modeImage: '../assets/gamemode/classic_mode.png',
      labelImage: '../assets/gamemode/most_popular.png',
      infoImage: '../assets/gamemode/gamemode_info_classic.png',
    },
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/most_popular.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/new.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/trending.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/most_popular.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/new.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/trending.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
    { href: 'classic.html', modeImage: '../assets/gamemode/classic_mode.png', labelImage: '../assets/gamemode/most_popular.png', infoImage: '../assets/gamemode/gamemode_info_classic.png'},
  ];

  async function loadCardsData() {
    var today = new Date().toISOString().slice(0, 10);
    var schedule = await fetchRows('daily_schedule', {
      select: 'mode_id,mode_slot',
      play_date: 'eq.' + today,
      order: 'mode_slot.asc',
    });

    if (!schedule.length) {
      throw new Error('daily_schedule: no modes for today');
    }

    var modeIds = schedule.map(function(row) { return row.mode_id; });
    var modes = await fetchRows('game_mode', {
      select: 'id,name,label,is_enabled',
      id: 'in.(' + modeIds.join(',') + ')',
      is_enabled: 'eq.true',
    });
    var modesById = {};
    modes.forEach(function(mode) { modesById[mode.id] = mode; });

    return schedule
      .map(function(row) {
        var mode = modesById[row.mode_id];
        if (!mode) return null;
        var modeName = normalizeModeName(mode.name);
        var labelName = normalizeModeName(mode.label);
        return {
          href: getModePage(mode.name),
          modeImage: '../assets/gamemode/' + modeName + '_mode.png',
          infoImage: '../assets/gamemode/gamemode_info_' + modeName + '.png',
          labelImage: labelName ? '../assets/gamemode/' + labelName + '.png' : null,
          infoText: mode.name,
          modeSlot: row.mode_slot,
        };
      })
      .filter(function(card) { return card !== null; });
  }

  function getCardsPerPage() {
    var width = window.innerWidth || document.documentElement.clientWidth;
    if (width <= 560) return cardsData.length;
    if (width <= 1120) return cardsData.length;
    if (width >= 1800) return 8;
    if (width >= 1500) return 6;
    return 4;
  }

  function getPageStep() {
    var cardsPerPage = getCardsPerPage();
    if (cardsPerPage <= rowsPerPage) return cardsPerPage;
    return rowsPerPage;
  }

  function getTotalPages() {
    var step = getPageStep();
    if (cardsData.length <= getCardsPerPage()) return 1;
    return Math.ceil(cardsData.length / step);
  }

  function renderModesPage() {
    var cardsPerPage = getCardsPerPage();
    var step = getPageStep();
    var totalPages = getTotalPages();

    if (currentPage >= totalPages) {
      currentPage = totalPages - 1;
    }

    var start = currentPage * step;

    modesGrid.innerHTML = '';

    for (var offset = 0; offset < cardsPerPage; offset++) {
      var cardIndex = (start + offset) % cardsData.length;
      var cardNode = createModeCard(cardsData[cardIndex], {
        onInfoClick: handleInfoClick,
      }, cardIndex);
      modesGrid.appendChild(cardNode);
    }
  }

  function animateToPage(nextPage, direction) {
    var isMobile = window.matchMedia('(max-width: 560px)').matches;
    if (isMobile) {
      currentPage = nextPage;
      renderModesPage();
      return;
    }

    if (isPaging) return;
    isPaging = true;
    modesGrid.classList.remove('is-entering-left', 'is-entering-right');
    modesGrid.classList.add(direction === 'next' ? 'is-leaving-left' : 'is-leaving-right');

    window.setTimeout(function() {
      currentPage = nextPage;
      renderModesPage();
      modesGrid.classList.remove('is-leaving-left', 'is-leaving-right');
      modesGrid.classList.add(direction === 'next' ? 'is-entering-right' : 'is-entering-left');

      window.setTimeout(function() {
        modesGrid.classList.remove('is-entering-left', 'is-entering-right');
        isPaging = false;
      }, PAGE_ANIM_IN_MS);
    }, PAGE_ANIM_OUT_MS);
  }

  function openInfoPanel(index) {
    var card = cardsData[index];
    infoImage.src = card && card.infoImage
      ? card.infoImage
      : '../assets/gamemode/gamemode_info_default.png';
    infoPanel.classList.add('open');
    infoPanel.setAttribute('aria-hidden', 'false');
    activeInfoIndex = index;

    // Scroll smooth vers le panel d'info en bas de page.
    window.requestAnimationFrame(function() {
      infoPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }

  function closeInfoPanel() {
    infoPanel.classList.remove('open');
    infoPanel.setAttribute('aria-hidden', 'true');
    activeInfoIndex = -1;
  }

  function handleInfoClick(payload) {
    var nextIndex = typeof payload.index === 'number' ? payload.index : -1;

    if (!infoPanel.classList.contains('open')) {
      openInfoPanel(nextIndex);
      return;
    }

    if (activeInfoIndex === nextIndex) {
      closeInfoPanel();
      return;
    }

    closeInfoPanel();
    window.setTimeout(function() {
      openInfoPanel(nextIndex);
    }, 130);
  }

  infoClose.addEventListener('click', closeInfoPanel);
  modesPrevBtn.addEventListener('click', function() {
    var totalPages = getTotalPages();
    var nextPage = currentPage <= 0 ? totalPages - 1 : currentPage - 1;
    animateToPage(nextPage, 'prev');
  });
  modesNextBtn.addEventListener('click', function() {
    var totalPages = getTotalPages();
    var nextPage = currentPage >= totalPages - 1 ? 0 : currentPage + 1;
    animateToPage(nextPage, 'next');
  });

  window.addEventListener('resize', renderModesPage);

  loadCardsData()
    .then(function(cards) {
      if (cards.length) {
        cardsData = cards;
        currentPage = 0;
        renderModesPage();
      }
    })
    .catch(function(error) {
      console.error('Impossible de charger les modes du jour.', error);
      renderModesPage();
    });