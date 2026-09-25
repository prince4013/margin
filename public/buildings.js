// 六向度建築造型設定：每個向度固定一種造型 + 一組顏色，高度依等級變化
const DIM_CONFIG = {
  learning: { label: '學習', labelEn: 'Learning', shape: 'plain', top: '#CECBF6', left: '#AFA9EC', right: '#7F77DD', stroke: '#534AB7' },
  social: { label: '關係', labelEn: 'Relationship', shape: 'pyramid', top: '#F4C0D1', left: '#ED93B1', right: '#D4537E', stroke: '#993556' },
  energy: { label: '能量', labelEn: 'Energy', shape: 'dome', top: '#FAC775', left: '#EF9F27', right: '#BA7517', stroke: '#854F0B' },
  economy: { label: '經濟', labelEn: 'Economy', shape: 'tiered', top: '#9FE1CB', left: '#5DCAA5', right: '#1D9E75', stroke: '#0F6E56' },
  exploration: { label: '探索', labelEn: 'Exploration', shape: 'lean', top: '#F5C4B3', left: '#F0997B', right: '#D85A30', stroke: '#993C1D' },
  reflection: { label: '反思', labelEn: 'Reflection', shape: 'plain', top: '#D3D1C7', left: '#B4B2A9', right: '#888780', stroke: '#5F5E5A' },
};

function pts(arr) {
  return arr.map((p) => p.join(',')).join(' ');
}

// ---- 顏色依滿意度調整飽和度：滿意度低 → 偏灰；滿意度高 → 原色飽和 ----
function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}
// satisfaction: 1-5，t=0 時偏灰、t=1 時全彩，最低也保留 25% 彩度避免整棟變死灰
function satisfactionMix(hex, satisfaction) {
  const s = satisfaction === undefined || satisfaction === null ? 3 : satisfaction;
  const raw = (s - 1) / 4; // 1→0, 5→1
  const t = 0.25 + 0.75 * Math.max(0, Math.min(1, raw));
  const [r, g, b] = hexToRgb(hex);
  const gray = (r + g + b) / 3;
  return rgbToHex([gray + (r - gray) * t, gray + (g - gray) * t, gray + (b - gray) * t]);
}
function tintedColors(cfg, satisfaction) {
  return {
    top: satisfactionMix(cfg.top, satisfaction),
    left: satisfactionMix(cfg.left, satisfaction),
    right: satisfactionMix(cfg.right, satisfaction),
    stroke: satisfactionMix(cfg.stroke, satisfaction),
  };
}

// 畫一個基本的等角箱體，回傳三個面的座標點陣列
function isoBox(cx, groundY, dx, dy, h) {
  const topY = groundY - 2 * dy - h;
  const T = [cx, topY];
  const R = [cx + dx, topY + dy];
  const B = [cx, topY + 2 * dy];
  const L = [cx - dx, topY + dy];
  const leftFace = [L, B, [cx, groundY], [cx - dx, topY + dy + h]];
  const rightFace = [B, R, [cx + dx, topY + dy + h], [cx, groundY]];
  const topFace = [T, R, B, L];
  return { T, R, B, L, leftFace, rightFace, topFace, topY };
}

function floorLines(cx, dx, groundY, h, level, stroke) {
  const n = Math.min(6, Math.max(0, level - 1));
  if (n === 0) return '';
  let out = '';
  for (let i = 1; i <= n; i++) {
    const y = groundY - (h * i) / (n + 1);
    out += `<line x1="${cx - dx}" y1="${y}" x2="${cx + dx}" y2="${y}" stroke="${stroke}" stroke-width="0.75" opacity="0.45"/>`;
  }
  return out;
}

// 產生一座建築「內部標記」的字串（不含外層 <svg>），方便嵌到更大的場景裡
// satisfaction (1-5，選填) 會影響顏色飽和度：越滿意色彩越飽和，越不滿意越偏灰
function buildingInnerMarkup(dimension, level, satisfaction) {
  const base = DIM_CONFIG[dimension];
  if (!base) return '';
  const cfg = tintedColors(base, satisfaction);
  const cx = 50;
  const groundY = 195;
  const dx = 20;
  const dy = 10;
  const h = 14 + level * 9;
  const box = isoBox(cx, groundY, dx, dy, h);
  let shapeMarkup = '';

  if (base.shape === 'plain') {
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.topFace)}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (base.shape === 'pyramid') {
    const rh = 22;
    const apex = [cx, box.topY - rh];
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.L, apex])}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.R, apex])}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (base.shape === 'dome') {
    const rise = 30;
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <path d="M${box.L[0]},${box.L[1]} Q${cx},${box.L[1] - rise} ${box.R[0]},${box.R[1]} Z" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (base.shape === 'lean') {
    const rh = 24;
    const apex = [cx - dx, box.topY + dy - rh];
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.L, apex])}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, apex, box.R])}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (base.shape === 'tiered') {
    const h1 = Math.round(h * 0.6);
    const h2 = h - h1;
    const box1 = isoBox(cx, groundY, dx, dy, h1);
    const groundY2 = box1.topY + dy;
    const box2 = isoBox(cx, groundY2, Math.round(dx * 0.6), Math.round(dy * 0.6), h2);
    shapeMarkup = `
      <polygon points="${pts(box1.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box1.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box1.topFace)}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box2.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box2.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box2.topFace)}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  }

  const lines = floorLines(cx, dx, groundY, h, level, cfg.stroke);
  return shapeMarkup + lines;
}

// 產生一座建築獨立的 SVG 字串，viewBox 固定 0 0 100 220，等級 1-12
function buildingSVG(dimension, level, satisfaction) {
  return `<svg viewBox="0 0 100 220" xmlns="http://www.w3.org/2000/svg">${buildingInnerMarkup(dimension, level, satisfaction)}</svg>`;
}

// 把六座建築嵌進一個固定版面的城市場景（含克萊德河背景），純靜態展示用
// 3x3 九宮格版面：第一排右兩格放建築(左上留白)；第二排(河下方)左右放建築、中間是森林；
// 第三排左邊兩格放建築、右下是湖。六個向度依序對應到六個建築格。
const CITY_LAYOUT = {
  learning:    { cx: 370, cy: 200 }, // 第一排中
  social:      { cx: 610, cy: 200 }, // 第一排右
  energy:      { cx: 130, cy: 460 }, // 第二排左
  economy:     { cx: 610, cy: 460 }, // 第二排右
  exploration: { cx: 130, cy: 720 }, // 第三排左
  reflection:  { cx: 370, cy: 720 }, // 第三排中
};
const FOREST_POS = { cx: 370, cy: 460 }; // 第二排中
const LAKE_POS = { cx: 610, cy: 720 }; // 第三排右

function forestMarkup(cx, cy) {
  const tree = (tx, ty, scale, dark) => `
    <polygon points="${tx - 18 * scale},${ty + 22 * scale} ${tx},${ty - 30 * scale} ${tx + 18 * scale},${ty + 22 * scale}" fill="${dark ? '#3DA98A' : '#5DCAA5'}"/>
    <polygon points="${tx - 13 * scale},${ty + 6 * scale} ${tx},${ty - 46 * scale} ${tx + 13 * scale},${ty + 6 * scale}" fill="${dark ? '#2E8F73' : '#4DB893'}"/>
  `;
  return `
    <g class="city-forest" aria-hidden="true">
      ${tree(cx - 34, cy + 14, 0.85, false)}
      ${tree(cx, cy + 18, 1.05, true)}
      ${tree(cx + 34, cy + 10, 0.9, false)}
    </g>
  `;
}

function lakeMarkup(cx, cy) {
  return `
    <g class="city-lake" aria-hidden="true">
      <ellipse cx="${cx}" cy="${cy}" rx="78" ry="46" fill="#A8D8F0"/>
      <path d="M${cx - 45},${cy - 4} Q${cx - 22},${cy - 14} ${cx},${cy - 4} T${cx + 45},${cy - 4}" stroke="#7EC1E8" stroke-width="2.5" fill="none" opacity="0.7"/>
      <path d="M${cx - 40},${cy + 10} Q${cx - 18},${cy + 2} ${cx + 4},${cy + 10} T${cx + 42},${cy + 10}" stroke="#7EC1E8" stroke-width="2.5" fill="none" opacity="0.5"/>
    </g>
  `;
}

// 🎛️ 這週投入量達到這個數字 → 開花；等於 0 → 落葉。中間則不裝飾
const BLOOM_THRESHOLD = 4;
const WILT_THRESHOLD = 0;

function decorationMarkup(state, cx, groundY) {
  if (state === 'bloom') {
    return `<g class="city-decor-bloom" transform="translate(${cx + 36},${groundY - 6})">
      <circle cx="0" cy="-6" r="3" fill="#F4A6C1"/>
      <circle cx="5" cy="-2" r="3" fill="#F4A6C1"/>
      <circle cx="-5" cy="-2" r="3" fill="#F4A6C1"/>
      <circle cx="0" cy="2" r="3" fill="#F4A6C1"/>
      <circle cx="0" cy="-2" r="2.3" fill="#FBD34D"/>
    </g>`;
  }
  if (state === 'wilt') {
    return `<g class="city-decor-wilt">
      <ellipse cx="${cx - 30}" cy="${groundY - 2}" rx="5" ry="3" fill="#A8825A" transform="rotate(-20 ${cx - 30} ${groundY - 2})"/>
      <ellipse cx="${cx - 38}" cy="${groundY + 4}" rx="4" ry="2.5" fill="#8B6B45" transform="rotate(15 ${cx - 38} ${groundY + 4})"/>
    </g>`;
  }
  return '';
}

function decorationState(weeklyInvestment) {
  if (weeklyInvestment === undefined || weeklyInvestment === null) return null;
  if (weeklyInvestment >= BLOOM_THRESHOLD) return 'bloom';
  if (weeklyInvestment <= WILT_THRESHOLD) return 'wilt';
  return null;
}

function citySceneSVG(data, weeklyInvestments) {
  const W = 110;
  const H = W * 2.2;
  const scale = H / 220;
  const buildingsMarkup = Object.keys(CITY_LAYOUT).map((dim, idx) => {
    const { cx, cy } = CITY_LAYOUT[dim];
    const level = (data && data[dim] && data[dim].level) || 1;
    const satisfaction = data && data[dim] ? data[dim].avgSatisfaction : 3;
    const x = cx - W / 2;
    const y = cy - H;
    const state = decorationState(weeklyInvestments ? weeklyInvestments[dim] : null);
    // 點擊熱區依實際樓層高度縮放，矮建築不會有一大塊空氣佔用點擊範圍，減少跟鄰居誤觸
    const hLocal = 14 + level * 9;
    const rectHeight = hLocal * scale + 90;
    const rectTop = cy + 34 - rectHeight;
    return `
      <g class="city-building" data-dim="${dim}" style="cursor:pointer; animation-delay:${idx * 0.07}s;">
        <rect x="${x - 6}" y="${rectTop}" width="${W + 12}" height="${rectHeight}" fill="transparent"/>
        <svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 100 220">${buildingInnerMarkup(dim, level, satisfaction)}</svg>
        ${decorationMarkup(state, cx, cy)}
        <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="17" font-weight="600" fill="var(--ink)">${DIM_CONFIG[dim].label}・${level}樓</text>
      </g>
    `;
  }).join('');

  return `
    <svg width="100%" viewBox="0 0 740 800" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="格拉斯哥城市示意，九宮格版面，六座建築搭配森林跟湖泊裝飾，高度代表等級">
      <rect x="0" y="0" width="740" height="800" fill="var(--card)"/>
      <path d="M -20 340 Q 240 300 400 345 T 760 320" stroke="var(--accent)" stroke-opacity="0.22" stroke-width="40" fill="none" stroke-linecap="round"/>
      <line x1="0" y1="120" x2="740" y2="130" stroke="var(--border)" stroke-width="1"/>
      ${forestMarkup(FOREST_POS.cx, FOREST_POS.cy)}
      ${lakeMarkup(LAKE_POS.cx, LAKE_POS.cy)}
      ${buildingsMarkup}
    </svg>
  `;
}
