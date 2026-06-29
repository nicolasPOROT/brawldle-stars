const RESET_LABEL = Utils.getTimeUntilMidnight();

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
  imgMenu.src = '../assets/gamemode/default.png';
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
  resetSpan.style.color = '#7583A4';
  resetSpan.style.fontFamily = "'Lilita One', cursive";
  resetSpan.style.fontSize = '20px';
  resetSpan.style.fontWeight = 'normal';
  resetSpan.style.letterSpacing = '0.5px';
  menuDiv.appendChild(resetSpan);

  card.appendChild(menuDiv);

  var underDiv = document.createElement('div');
  underDiv.style.position = 'relative';
  underDiv.style.width = '100%';
  underDiv.style.height = 'auto';
  underDiv.style.marginTop = '-20px';
  underDiv.style.display = 'flex';
  underDiv.style.justifyContent = 'center';
  underDiv.style.alignItems = 'flex-end';
  var imgUnder = document.createElement('img');
  imgUnder.src = '../assets/gamemode/most_popular.png';
  imgUnder.alt = 'Most Popular';
  imgUnder.style.width = '76%';
  imgUnder.style.height = 'auto';
  underDiv.appendChild(imgUnder);
  card.appendChild(underDiv);

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
      infoText: 'Devine le Brawler du jour en te basant sur ses caractéristiques.<br><br>🟩 Correct &nbsp; 🟨 Proche &nbsp; 🟥 Incorrect<br><br>⬆️/⬇️ indique si l\'année cible est plus récente ou plus ancienne.',
    },
    { href: 'classic.html', infoText: 'Mode compétitif.' },
    { href: 'classic.html', infoText: 'Mode contre la montre.' },
    { href: 'classic.html', infoText: 'Mode duo.' },
    { href: 'classic.html', infoText: 'Mode survie.' },
    { href: 'classic.html', infoText: 'Mode événements.' },
    { href: 'classic.html', infoText: 'Mode défis.' },
    { href: 'classic.html', infoText: 'Mode classement.' },
  ];

  function getCardsPerPage() {
    var width = window.innerWidth || document.documentElement.clientWidth;
    if (width <= 560) return cardsData.length;
    if (width <= 1120) return cardsData.length;
    if (width >= 1800) return cardsData.length;
    if (width >= 1500) return 6;
    return 4;
  }

  function getPageStep() {
    var cardsPerPage = getCardsPerPage();
    if (cardsPerPage <= rowsPerPage) return cardsPerPage;
    return rowsPerPage;
  }

  function getTotalPages() {
    var cardsPerPage = getCardsPerPage();
    var step = getPageStep();
    if (cardsData.length <= cardsPerPage) return 1;
    return Math.floor((cardsData.length - cardsPerPage + step - 1) / step) + 1;
  }

  function renderModesPage() {
    var isMobile = window.matchMedia('(max-width: 560px)').matches;
    var cardsPerPage = getCardsPerPage();
    var step = getPageStep();
    var totalPages = getTotalPages();

    if (currentPage >= totalPages) {
      currentPage = totalPages - 1;
    }

    var start = currentPage * step;
    var end = Math.min(start + cardsPerPage, cardsData.length);

    modesGrid.innerHTML = '';

    for (var i = start; i < end; i++) {
      var cardNode = createModeCard(cardsData[i], {
        onInfoClick: handleInfoClick,
      }, i);
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

  renderModesPage();