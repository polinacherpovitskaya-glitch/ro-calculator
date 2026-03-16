/**
 * Corporate Gift Constructor — App Logic
 * State management, DOM binding, validation, Google Sheets submission
 */

// === State ===
const state = {
  letters: [],          // [{char, color}]
  cordColor: '',
  carabinerColor: '',
  config: null
};

// === Config & Init ===

async function loadConfig() {
  const res = await fetch('config.json');
  state.config = await res.json();
  initPage();
}

function populateSelect(id, options) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">Выбери...</option>' +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
}

function initPage() {
  const c = state.config;

  // Greeting
  document.getElementById('greetingTitle').textContent = c.greeting;
  document.getElementById('greetingSubtext').textContent = c.subtext;
  document.getElementById('maxLetters').textContent = c.maxLetters;
  document.getElementById('maxLettersCounter').textContent = c.maxLetters;

  // Defaults
  state.cordColor = c.cordColors[0].hex;
  state.carabinerColor = c.carabinerColors[0].hex;

  // Set input maxlength from config
  document.getElementById('wordInput').maxLength = c.maxLetters;

  // Render swatches
  renderSwatches('cordSwatches', c.cordColors, state.cordColor, selectCord);
  renderSwatches('carabinerSwatches', c.carabinerColors, state.carabinerColor, selectCarabiner);

  // Populate delivery dropdowns
  populateSelect('building', c.delivery.buildings);
  populateSelect('floor', c.delivery.floors);
  populateSelect('department', c.delivery.departments);

  // Restore state from any browser-persisted input value
  const existingValue = document.getElementById('wordInput').value;
  if (existingValue) {
    document.getElementById('wordInput').dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Initial preview (empty state if no existing value)
  updatePreview();
  toggleSteps();

  // Setup smart sticky preview
  setupSmartSticky();
}

// === Smart Sticky Preview ===
// Preview sticks during customization (word, cord, carabiner, result)
// but unsticks when delivery form comes into view

function setupSmartSticky() {
  const preview = document.getElementById('pendantPreview');
  const customizationZone = document.getElementById('customizationZone');
  const deliverySection = document.getElementById('stepDelivery');

  if (!preview || !customizationZone) return;

  // Unstick preview when delivery form becomes primary content
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        preview.classList.remove('preview--unstuck');
      } else {
        const rect = customizationZone.getBoundingClientRect();
        if (rect.bottom < 100) {
          preview.classList.add('preview--unstuck');
        } else {
          preview.classList.remove('preview--unstuck');
        }
      }
    });
  }, {
    threshold: 0,
    rootMargin: '-100px 0px 0px 0px'
  });

  observer.observe(customizationZone);
}

// === Word Input ===

document.getElementById('wordInput').addEventListener('input', function(e) {
  const c = state.config;
  // Uppercase first, then filter to allowed alphabets
  let raw = e.target.value.toUpperCase();

  // Filter: only Cyrillic А-ЯЁ and Latin A-Z
  let filtered = '';
  for (const ch of raw) {
    if (/[А-ЯЁ]/.test(ch) || /[A-Z]/.test(ch)) {
      filtered += ch;
    }
  }

  // Enforce max length
  filtered = filtered.slice(0, c.maxLetters);
  e.target.value = filtered;

  // Update state — preserve colors for unchanged positions
  const defaultColor = c.letterColors[0].hex;
  state.letters = [...filtered].map((char, i) => ({
    char,
    color: (state.letters[i] && state.letters[i].char === char)
      ? state.letters[i].color
      : (state.letters[i] ? state.letters[i].color : defaultColor)
  }));

  document.getElementById('letterCount').textContent = state.letters.length;
  renderLetterColorPickers();
  updatePreview();

  // Show/hide subsequent steps based on input
  toggleSteps();
});

// === Letter Color Pickers ===

function renderLetterColorPickers() {
  const container = document.getElementById('letterColors');
  if (!state.letters.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<p class="letter-colors__hint">Нажми на кружок, чтобы выбрать цвет буквы</p>' +
    state.letters.map((letter, i) => `
    <div class="letter-color-group">
      <span class="letter-color-group__char" style="color:${letter.color}">${letter.char}</span>
      <div class="letter-color-group__dots">
        ${state.config.letterColors.map(c => `
          <button type="button" class="color-dot ${c.hex === letter.color ? 'color-dot--active' : ''}"
            style="background:${c.hex}"
            data-letter-index="${i}"
            data-color="${c.hex}"
            title="${c.name}"
            aria-label="Цвет ${c.name} для буквы ${letter.char}"></button>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Delegated click
  container.onclick = function(e) {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    const idx = parseInt(dot.dataset.letterIndex);
    state.letters[idx].color = dot.dataset.color;
    renderLetterColorPickers();
    updatePreview();
  };
}

// === Swatches ===

function renderSwatches(containerId, colors, activeHex, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = colors.map(c => `
    <div class="swatch-group">
      <button type="button" class="swatch ${c.hex === activeHex ? 'swatch--active' : ''}"
        style="background:${c.hex}"
        data-hex="${c.hex}"
        title="${c.name}"
        aria-label="${c.name}"></button>
      <span class="swatch__label">${c.name}</span>
    </div>
  `).join('');

  container.onclick = function(e) {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    onSelect(swatch.dataset.hex);
  };
}

function selectCord(hex) {
  state.cordColor = hex;
  renderSwatches('cordSwatches', state.config.cordColors, hex, selectCord);
  updatePreview();
}

function selectCarabiner(hex) {
  state.carabinerColor = hex;
  renderSwatches('carabinerSwatches', state.config.carabinerColors, hex, selectCarabiner);
  updatePreview();
}

// === Preview ===

function updatePreview() {
  const svg = renderPendant({
    letters: state.letters,
    cordColor: state.cordColor,
    carabinerColor: state.carabinerColor,
    charmColor: state.config.charmColor
  });
  document.getElementById('svgContainer').innerHTML = svg;
}

// === Step Visibility ===

function toggleSteps() {
  const hasWord = state.letters.length > 0;
  // Steps after word input fade in when there's text
  const steps = ['stepCord', 'stepCarabiner', 'stepResult', 'stepDelivery'];
  steps.forEach(id => {
    document.getElementById(id).style.opacity = hasWord ? '1' : '0.3';
    document.getElementById(id).style.pointerEvents = hasWord ? 'auto' : 'none';
  });
}

// === Form Submission ===

document.getElementById('orderForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const building = document.getElementById('building').value;
  const floor = document.getElementById('floor').value;
  const department = document.getElementById('department').value;

  // Validate pendant
  if (!state.letters.length) {
    shakeElement(document.getElementById('wordInput'));
    document.getElementById('wordInput').focus();
    return;
  }

  // Validate form
  if (!fullName || !phone || !building || !floor || !department) {
    const fields = [
      { el: 'fullName', val: fullName },
      { el: 'phone', val: phone },
      { el: 'building', val: building },
      { el: 'floor', val: floor },
      { el: 'department', val: department }
    ];
    for (const f of fields) {
      if (!f.val) {
        const el = document.getElementById(f.el);
        shakeElement(el);
        el.focus();
        break;
      }
    }
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Отправляем...';

  // Find color names for readable sheet data
  function findColorName(hex, palette) {
    const found = palette.find(c => c.hex === hex);
    return found ? found.name : hex;
  }

  const payload = {
    date: new Date().toLocaleString('ru-RU'),
    word: state.letters.map(l => l.char).join(''),
    lettersDetail: state.letters.map(l => {
      const name = findColorName(l.color, state.config.letterColors);
      return `${l.char}:${name}`;
    }).join(', '),
    cordColor: findColorName(state.cordColor, state.config.cordColors),
    carabinerColor: findColorName(state.carabinerColor, state.config.carabinerColors),
    letterCount: state.letters.length,
    fullName,
    phone,
    building,
    floor,
    department
  };

  try {
    if (state.config.googleScriptUrl) {
      await fetch(state.config.googleScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      console.log('Order payload (no Google Script URL configured):', payload);
    }

    // Show success
    document.querySelector('.header').classList.add('hidden');
    document.querySelector('.greeting').classList.add('hidden');
    document.getElementById('constructor').classList.add('hidden');
    document.getElementById('thankYou').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error('Submission error:', err);
    btn.disabled = false;
    btn.textContent = 'Попробовать ещё раз';
  }
});

// === Helpers ===

function shakeElement(el) {
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

// === Init ===

document.addEventListener('DOMContentLoaded', function() {
  loadConfig();
  toggleSteps();
});
