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

  // Filter based on configured alphabets
  let filtered = '';
  for (const ch of raw) {
    const isLatin = /[A-Z]/.test(ch);
    const isCyrillic = /[А-ЯЁ]/.test(ch);
    if ((c.alphabets.includes('en') && isLatin) || (c.alphabets.includes('ru') && isCyrillic)) {
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
      : (state.letters[i] ? state.letters[i].color : defaultColor),
    get resolvedColor() { return resolveLetterColor(this.color, i); }
  }));

  document.getElementById('letterCount').textContent = state.letters.length;
  renderLetterColorPickers();
  updateRainbowButton();
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

  // Only show solid colors in per-letter pickers (no rainbow)
  const solidColors = state.config.letterColors.filter(c => c.hex !== 'rainbow');

  container.innerHTML = '<p class="letter-colors__hint">Нажми на кружок, чтобы выбрать цвет буквы</p>' +
    state.letters.map((letter, i) => `
    <div class="letter-color-group">
      <span class="letter-color-group__char" style="color:${letter.resolvedColor}">${letter.char}</span>
      <div class="letter-color-group__dots">
        ${solidColors.map(c => `
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

  // Delegated click — solid colors only
  container.onclick = function(e) {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    const idx = parseInt(dot.dataset.letterIndex);
    const color = dot.dataset.color;

    state.letters[idx].color = color;
    // If switching from rainbow, clear rainbow for this letter
    renderLetterColorPickers();
    updateRainbowButton();
    updatePreview();
  };
}

// === Rainbow Option ===

function updateRainbowButton() {
  const rainbowOption = document.getElementById('rainbowOption');
  const rainbowBtn = document.getElementById('rainbowBtn');
  if (!state.letters.length) {
    rainbowOption.classList.add('hidden');
    return;
  }
  rainbowOption.classList.remove('hidden');

  const isActive = state.letters.every(l => l.color === 'rainbow');
  rainbowBtn.classList.toggle('rainbow-btn--active', isActive);
  document.getElementById('rainbowNote').classList.toggle('hidden', !isActive);
}

document.getElementById('rainbowBtn').addEventListener('click', function() {
  if (!state.letters.length) return;

  const isAlreadyRainbow = state.letters.every(l => l.color === 'rainbow');
  if (isAlreadyRainbow) {
    // Re-shuffle on repeated clicks
    shuffleRainbow(state.letters.length);
    showToast('Новая комбинация цветов!');
  } else {
    // Apply rainbow to ALL letters
    state.letters.forEach(l => { l.color = 'rainbow'; });
    shuffleRainbow(state.letters.length);
    showToast('Цвета букв будут подобраны случайно — каждый раз новая комбинация!');
  }

  renderLetterColorPickers();
  updateRainbowButton();
  updatePreview();
});

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
  // Resolve rainbow colors before passing to SVG renderer
  const resolvedLetters = state.letters.map((l, i) => ({
    char: l.char,
    color: resolveLetterColor(l.color, i)
  }));
  const svg = renderPendant({
    letters: resolvedLetters,
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
  const contactInfo = document.getElementById('contactInfo').value.trim();
  const company = document.getElementById('company').value.trim();
  const city = document.getElementById('city').value.trim();
  const address = document.getElementById('address').value.trim();
  const comment = document.getElementById('comment').value.trim();

  // Validate pendant
  if (!state.letters.length) {
    shakeElement(document.getElementById('wordInput'));
    document.getElementById('wordInput').focus();
    return;
  }

  // Validate required fields
  if (!fullName || !phone || !contactInfo || !company || !city || !address) {
    const fields = [
      { el: 'fullName', val: fullName },
      { el: 'phone', val: phone },
      { el: 'contactInfo', val: contactInfo },
      { el: 'company', val: company },
      { el: 'city', val: city },
      { el: 'address', val: address }
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

  function buildSubmissionComment(contactValue, companyValue, commentValue) {
    const parts = [
      `Контакт: ${contactValue}`,
      `Компания: ${companyValue}`
    ];

    if (commentValue) {
      parts.push(`Комментарий: ${commentValue}`);
    }

    return parts.join(' | ');
  }

  // Find color names for readable sheet data
  function findColorName(hex, palette) {
    const found = palette.find(c => c.hex === hex);
    return found ? found.name : hex;
  }

  // Check if any letter uses rainbow
  const hasRainbow = state.letters.some(l => l.color === 'rainbow');

  // Generate pendant image as base64 PNG
  let pendantImage = '';
  try {
    pendantImage = await svgToPngBase64();
  } catch (err) {
    console.warn('Could not generate pendant image:', err);
  }

  const payload = {
    date: new Date().toLocaleString('ru-RU'),
    word: state.letters.map(l => l.char).join(''),
    lettersDetail: state.letters.map((l, i) => {
      if (l.color === 'rainbow') {
        return `${l.char}:РАЗНОЦВЕТНЫЙ`;
      }
      return `${l.char}:${findColorName(l.color, state.config.letterColors)}`;
    }).join(', '),
    isRainbow: hasRainbow ? 'ДА — РАЗНОЦВЕТНЫЙ (случайные цвета)' : 'Нет',
    cordColor: findColorName(state.cordColor, state.config.cordColors),
    carabinerColor: findColorName(state.carabinerColor, state.config.carabinerColors),
    letterCount: state.letters.length,
    fullName,
    phone,
    contactInfo,
    company,
    city,
    address,
    // Keep the extra contact data in the legacy comment field so the current
    // deployed Apps Script still captures it even before its own code is updated.
    comment: buildSubmissionComment(contactInfo, company, comment),
    userComment: comment || '—',
    pendantImage
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

// === SVG to PNG ===

function svgToPngBase64() {
  return new Promise((resolve, reject) => {
    const svgEl = document.querySelector('#svgContainer svg');
    if (!svgEl) return reject('No SVG found');

    // Clone SVG and set explicit width/height from viewBox so the image renders at full size
    const clone = svgEl.cloneNode(true);
    const vb = svgEl.viewBox.baseVal;
    const renderWidth = vb.width || 600;
    const renderHeight = vb.height || 140;
    clone.setAttribute('width', renderWidth);
    clone.setAttribute('height', renderHeight);

    const svgData = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function() {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = renderWidth * scale;
      canvas.height = renderHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, renderWidth, renderHeight);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// === Rainbow Colors ===

const RAINBOW_PALETTE = [
  '#FF4D6A', '#FF8C42', '#FFD439', '#BFFF00', '#42D4F4',
  '#7B68EE', '#FF69B4', '#1B1F8A', '#E8524A', '#00CED1'
];

// Store randomized colors per letter when rainbow is active
let rainbowCache = [];

function shuffleRainbow(count) {
  rainbowCache = [];
  const pool = [...RAINBOW_PALETTE];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    rainbowCache.push(pool[idx]);
  }
}

function resolveLetterColor(hex, index) {
  if (hex === 'rainbow') {
    return rainbowCache[index] || RAINBOW_PALETTE[index % RAINBOW_PALETTE.length];
  }
  return hex;
}

// === Helpers ===

function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}

function shakeElement(el) {
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

// === Init ===

document.addEventListener('DOMContentLoaded', function() {
  loadConfig();
  toggleSteps();
});
