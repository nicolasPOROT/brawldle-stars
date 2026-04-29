function getTimeUntilMidnight() {
  var now      = new Date();
  var midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  var diff = midnight - now;
  var h    = Math.floor(diff / 3600000);
  var m    = Math.floor((diff % 3600000) / 60000);
  return 'Reset in: ' + String(h).padStart(2,'0') + 'h ' + String(m).padStart(2,'0') + 'm';
}
var RESET_LABEL = getTimeUntilMidnight();

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
  resetSpan.textContent = RESET_LABEL;
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