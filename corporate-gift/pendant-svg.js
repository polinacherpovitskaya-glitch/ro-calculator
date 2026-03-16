/**
 * Pendant SVG Visualizer v2
 * Based on real product photos:
 * - Letters sit ON the cord (cord passes through them)
 * - Knots between letters
 * - Metal carabiner ring on the left
 * - Two cord tails on the right
 * - Heart charm inline with letters
 * - 3D chunky letter style
 */

function renderPendant(state) {
  const { letters, cordColor, carabinerColor, charmColor } = state;

  // Layout constants
  const CORD_Y = 70;             // center line of cord
  const LETTER_SIZE = 38;        // letter font size
  const LETTER_SPACING = 38;     // distance between letter centers
  const KNOT_WIDTH = 14;         // width of knot between letters
  const CARABINER_X = 40;        // carabiner center X
  const CORD_FROM_CARABINER = 75; // where cord starts from carabiner
  const FIRST_LETTER_X = 105;    // first letter center

  const letterCount = letters.length;
  const hasLetters = letterCount > 0;

  // Calculate total width
  const lettersWidth = hasLetters ? letterCount * LETTER_SPACING : 0;
  const heartWidth = LETTER_SPACING;
  const HEART_KNOT_GAP = 18; // visible cord between heart and end knot
  const tailWidth = 80;
  const totalWidth = FIRST_LETTER_X + lettersWidth + heartWidth + HEART_KNOT_GAP + 14 + tailWidth + 20;
  const SVG_HEIGHT = 140;

  if (!hasLetters) {
    return renderEmpty(carabinerColor, cordColor, charmColor);
  }

  // Build defs for shadows and gradients
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${SVG_HEIGHT}">
  <defs>
    <filter id="letterShadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.2"/>
    </filter>
    <filter id="cordShadow" x="-5%" y="-20%" width="110%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>`;

  // 1. Cord — main line behind everything
  const lastElementX = FIRST_LETTER_X + letterCount * LETTER_SPACING; // heart position
  const knotAfterHeartX = lastElementX + HEART_KNOT_GAP + 7; // heart center + gap + knot rx
  const tailStartX = knotAfterHeartX + 9; // after knot, small gap, then tails split
  svg += drawCord(CORD_FROM_CARABINER, tailStartX, CORD_Y, cordColor, tailWidth);

  // 2. Letters sitting on cord
  for (let i = 0; i < letterCount; i++) {
    const x = FIRST_LETTER_X + i * LETTER_SPACING;
    svg += drawLetter3D(x, CORD_Y, letters[i].char, letters[i].color, LETTER_SIZE);
  }

  // 3. Heart charm inline
  const heartX = lastElementX;
  svg += drawHeartInline(heartX, CORD_Y, charmColor);

  // 4. Knot after heart — with a visible cord gap between heart and knot
  svg += drawKnot(knotAfterHeartX, CORD_Y, cordColor);

  // 5. Carabiner ring (metal, on the left)
  svg += drawCarabinerRing(CARABINER_X, CORD_Y, carabinerColor);

  // 6. Connection piece (cord wraps around carabiner)
  svg += drawConnector(CARABINER_X + 18, CORD_FROM_CARABINER, CORD_Y, cordColor, carabinerColor);

  svg += '</svg>';
  return svg;
}

function renderEmpty(carabinerColor, cordColor, charmColor) {
  // Empty state: just a plain grey cord — carabiner, knot, cord, knot, tails
  // No letters, no heart, no dashes. Just a simple lanyard waiting for text.
  const W = 420;
  const H = 130;
  const Y = 60;
  const grey = '#888888';
  const greyDark = '#666666';
  const greyLight = '#999999';
  const tipGrey = '#909090';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="cordShadow" x="-5%" y="-20%" width="110%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.08"/>
      </filter>
    </defs>
    <!-- Carabiner ring -->
    <circle cx="40" cy="${Y}" r="14" fill="none" stroke="${grey}" stroke-width="4.5"/>
    <path d="M 30 ${Y - 10} A 14 14 0 0 1 50 ${Y - 10}" fill="none" stroke="${greyLight}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    <!-- Connector wrap -->
    <ellipse cx="62" cy="${Y}" rx="6" ry="5" fill="${grey}" stroke="${greyDark}" stroke-width="0.8"/>
    <!-- Main cord -->
    <line x1="68" y1="${Y}" x2="280" y2="${Y}" stroke="${grey}" stroke-width="8" stroke-linecap="round"/>
    <!-- Knot at start -->
    <ellipse cx="85" cy="${Y}" rx="6" ry="5" fill="${grey}" stroke="${greyDark}" stroke-width="0.8"/>
    <!-- Knot at end -->
    <ellipse cx="275" cy="${Y}" rx="6" ry="5" fill="${grey}" stroke="${greyDark}" stroke-width="0.8"/>
    <!-- Tails -->
    <path d="M 280 ${Y} Q 305 ${Y - 2} 345 ${Y + 14}" fill="none" stroke="${grey}" stroke-width="7" stroke-linecap="round"/>
    <path d="M 280 ${Y} Q 298 ${Y + 5} 335 ${Y + 28}" fill="none" stroke="${grey}" stroke-width="7" stroke-linecap="round"/>
    <!-- Silicone tips -->
    <rect x="343" y="${Y + 14 - 4}" width="12" height="7" rx="3" fill="${tipGrey}" stroke="${greyDark}" stroke-width="0.4" transform="rotate(8, 345, ${Y + 14})"/>
    <rect x="333" y="${Y + 28 - 4}" width="12" height="7" rx="3" fill="${tipGrey}" stroke="${greyDark}" stroke-width="0.4" transform="rotate(14, 335, ${Y + 28})"/>
    <!-- Hint text -->
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="#BBB" font-weight="400">Введи своё слово</text>
  </svg>`;
}

function drawCarabinerRing(cx, cy, color) {
  // Simple metal ring — like real carabiner ring
  const lighter = lightenColor(color, 40);
  return `
    <g>
      <!-- Outer ring -->
      <circle cx="${cx}" cy="${cy}" r="16"
        fill="none" stroke="${color}" stroke-width="5" />
      <!-- Highlight on ring -->
      <path d="M ${cx - 10} ${cy - 12} A 16 16 0 0 1 ${cx + 10} ${cy - 12}"
        fill="none" stroke="${lighter}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    </g>`;
}

function drawConnector(fromX, toX, y, cordColor, carabinerColor) {
  // Cord wraps/ties around the carabiner ring — visible knot/wrap
  const wrapX = fromX + 2;
  return `
    <g>
      <!-- Cord wrapping around carabiner ring -->
      <!-- First wrap loop going through the ring -->
      <path d="M ${wrapX} ${y - 8} C ${wrapX - 6} ${y - 12}, ${wrapX - 10} ${y - 4}, ${wrapX - 4} ${y}"
        fill="none" stroke="${cordColor}" stroke-width="6" stroke-linecap="round"/>
      <path d="M ${wrapX - 4} ${y} C ${wrapX - 10} ${y + 4}, ${wrapX - 6} ${y + 12}, ${wrapX} ${y + 8}"
        fill="none" stroke="${cordColor}" stroke-width="6" stroke-linecap="round"/>
      <!-- Wrap knot/bundle where cord gathers -->
      <ellipse cx="${wrapX + 6}" cy="${y}" rx="7" ry="6"
        fill="${cordColor}" stroke="${darkenColor(cordColor, 15)}" stroke-width="1"/>
      <!-- Highlight on knot -->
      <ellipse cx="${wrapX + 5}" cy="${y - 2}" rx="3" ry="2"
        fill="white" opacity="0.2"/>
      <!-- Cord going from knot to letters -->
      <line x1="${wrapX + 13}" y1="${y}" x2="${toX}" y2="${y}"
        stroke="${cordColor}" stroke-width="8" stroke-linecap="round" filter="url(#cordShadow)"/>
    </g>`;
}

function drawCord(fromX, toX, y, color, tailLength) {
  // Main cord line + two tails with silicone end caps
  const tailEndX1 = toX + tailLength;
  const tailEndX2 = toX + tailLength - 12;
  const tailSpread = 14;
  const tipColor = '#F2A0B0'; // pink silicone tips
  const tipDarker = '#D88A98';
  const tipLength = 14;
  const tipWidth = 7;

  // Calculate tail end angles for tip rotation
  const tail1EndY = y + tailSpread;
  const tail2EndY = y + tailSpread + 16;

  return `
    <g filter="url(#cordShadow)">
      <!-- Main cord -->
      <line x1="${fromX}" y1="${y}" x2="${toX}" y2="${y}"
        stroke="${color}" stroke-width="8" stroke-linecap="round"/>
      <!-- Tail split — two ends going right and down -->
      <path d="M ${toX} ${y} Q ${toX + 25} ${y - 2} ${tailEndX1} ${tail1EndY}"
        fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
      <path d="M ${toX} ${y} Q ${toX + 18} ${y + 6} ${tailEndX2} ${tail2EndY}"
        fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    </g>
    <!-- Silicone end caps — thicker than cord, pink -->
    <g>
      <!-- Tip 1 -->
      <rect x="${tailEndX1 - 2}" y="${tail1EndY - tipWidth / 2}"
        width="${tipLength}" height="${tipWidth}" rx="3" ry="3"
        fill="${tipColor}" stroke="${tipDarker}" stroke-width="0.5"
        transform="rotate(8, ${tailEndX1}, ${tail1EndY})"/>
      <!-- Tip 1 highlight -->
      <rect x="${tailEndX1}" y="${tail1EndY - tipWidth / 2 + 1}"
        width="${tipLength - 4}" height="2.5" rx="1" ry="1"
        fill="white" opacity="0.25"
        transform="rotate(8, ${tailEndX1}, ${tail1EndY})"/>
      <!-- Tip 2 -->
      <rect x="${tailEndX2 - 2}" y="${tail2EndY - tipWidth / 2}"
        width="${tipLength}" height="${tipWidth}" rx="3" ry="3"
        fill="${tipColor}" stroke="${tipDarker}" stroke-width="0.5"
        transform="rotate(14, ${tailEndX2}, ${tail2EndY})"/>
      <!-- Tip 2 highlight -->
      <rect x="${tailEndX2}" y="${tail2EndY - tipWidth / 2 + 1}"
        width="${tipLength - 4}" height="2.5" rx="1" ry="1"
        fill="white" opacity="0.25"
        transform="rotate(14, ${tailEndX2}, ${tail2EndY})"/>
    </g>`;
}

function drawKnot(cx, cy, color) {
  // Knot — a thicker bump on the cord
  const darker = darkenColor(color, 20);
  return `
    <g>
      <ellipse cx="${cx}" cy="${cy}" rx="${7}" ry="${5.5}"
        fill="${color}" stroke="${darker}" stroke-width="1"/>
      <!-- Knot highlight -->
      <ellipse cx="${cx - 1}" cy="${cy - 2}" rx="3" ry="2"
        fill="white" opacity="0.15"/>
    </g>`;
}

function drawLetter3D(cx, cy, char, color, size) {
  // 3D chunky letter — cord passes through the MIDDLE of the letter
  const darker = darkenColor(color, 30);
  const lighter = lightenColor(color, 30);
  // Text y is baseline. For capital letters, visual center ≈ baseline - size*0.35
  // We want visual center = cy (cord line), so baseline = cy + size*0.35
  const baseline = cy + size * 0.35;

  return `
    <g filter="url(#letterShadow)">
      <!-- 3D depth (offset darker copy) -->
      <text x="${cx + 1.5}" y="${baseline + 1.5}"
        text-anchor="middle"
        font-family="'Cyberion Demo', Arial Black, sans-serif"
        font-size="${size}"
        font-weight="900"
        fill="${darker}">${escapeXml(char)}</text>
      <!-- Main letter face -->
      <text x="${cx}" y="${baseline}"
        text-anchor="middle"
        font-family="'Cyberion Demo', Arial Black, sans-serif"
        font-size="${size}"
        font-weight="900"
        fill="${color}">${escapeXml(char)}</text>
      <!-- Top highlight -->
      <text x="${cx - 0.5}" y="${baseline - 0.5}"
        text-anchor="middle"
        font-family="'Cyberion Demo', Arial Black, sans-serif"
        font-size="${size}"
        font-weight="900"
        fill="${lighter}"
        opacity="0.3">${escapeXml(char)}</text>
    </g>`;
}

function drawHeartInline(cx, cy, color) {
  // Heart charm sitting inline on cord, same size as letters
  const darker = darkenColor(color, 25);
  const scale = 0.5;
  const heartPath = 'M 0,-15 C -20,-40 -45,-10 -25,10 L 0,30 L 25,10 C 45,-10 20,-40 0,-15 Z';

  // R.O. logo paths (scaled down from original 314x205 viewBox to fit inside heart)
  // Centered at 0,0, scaled to ~0.07 of original
  const logoScale = 0.065;
  const logoOffsetX = -314 * logoScale / 2; // center horizontally
  const logoOffsetY = -205 * logoScale / 2 + 5; // center vertically, nudge down

  return `
    <g filter="url(#letterShadow)">
      <!-- 3D depth -->
      <g transform="translate(${cx + 1.5}, ${cy + 1.5}) scale(${scale})">
        <path d="${heartPath}" fill="${darker}"/>
      </g>
      <!-- Main heart -->
      <g transform="translate(${cx}, ${cy}) scale(${scale})">
        <path d="${heartPath}" fill="${color}"/>
        <!-- R.O. logo -->
        <g transform="translate(${logoOffsetX}, ${logoOffsetY}) scale(${logoScale})" fill="white" opacity="0.9">
          <path d="M0 202.128V4.09171H58.5396C90.6921 4.09171 114.197 21.4749 114.197 54.2608V62.1822C114.197 94.9682 90.8029 111.031 61.2005 112.571L120.294 202.128H88.3638L26.6089 105.2V202.128H0ZM26.6089 28.4061V90.6774H55.8787C75.2811 90.6774 87.5877 81.6557 87.5877 59.5417V56.9013C87.5877 35.9975 75.3919 28.4061 55.8787 28.4061H26.6089Z"/>
          <path d="M253.003 101.473V135.791C253.003 167.896 240.689 179.409 220.54 179.409C200.167 179.409 188.077 168.006 188.077 135.791V101.473H161.211V135.791C161.211 181.512 183.487 203.764 220.54 203.764C257.592 203.764 279.869 181.402 279.869 135.791V101.473H253.003Z"/>
          <path d="M305.237 67.429V101.473H278.742V67.429C278.742 35.8011 266.819 24.1602 246.727 24.1602C226.855 24.1602 214.711 35.8011 214.711 67.429V101.473H188.216V67.429C188.216 22.4031 210.185 0 246.727 0C283.268 0 305.237 22.4031 305.237 67.429Z"/>
          <path d="M295.694 204.582C306.277 204.582 313.42 196.91 313.42 187.121C313.42 177.067 306.277 169.394 295.694 169.394C285.64 169.394 278.232 177.067 278.232 187.121C278.232 196.91 285.64 204.582 295.694 204.582Z"/>
          <path d="M142.666 204.582C153.249 204.582 160.393 196.91 160.393 187.121C160.393 177.067 153.249 169.394 142.666 169.394C132.613 169.394 125.204 177.067 125.204 187.121C125.204 196.91 132.613 204.582 142.666 204.582Z"/>
        </g>
      </g>
      <!-- Highlight -->
      <g transform="translate(${cx - 0.5}, ${cy - 0.5}) scale(${scale})">
        <path d="${heartPath}" fill="white" opacity="0.15"/>
      </g>
    </g>`;
}

// === Color Utilities ===

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => {
    c = Math.max(0, Math.min(255, Math.round(c)));
    return c.toString(16).padStart(2, '0');
  }).join('');
}

function darkenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r - amount, g - amount, b - amount);
}

function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
