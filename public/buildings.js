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
function buildingInnerMarkup(dimension, level) {
  const cfg = DIM_CONFIG[dimension];
  if (!cfg) return '';
  const cx = 50;
  const groundY = 195;
  const dx = 20;
  const dy = 10;
  const h = 14 + level * 9;
  const box = isoBox(cx, groundY, dx, dy, h);
  let shapeMarkup = '';

  if (cfg.shape === 'plain') {
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.topFace)}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (cfg.shape === 'pyramid') {
    const rh = 22;
    const apex = [cx, box.topY - rh];
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.L, apex])}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.R, apex])}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (cfg.shape === 'dome') {
    const rise = 30;
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <path d="M${box.L[0]},${box.L[1]} Q${cx},${box.L[1] - rise} ${box.R[0]},${box.R[1]} Z" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (cfg.shape === 'lean') {
    const rh = 24;
    const apex = [cx - dx, box.topY + dy - rh];
    shapeMarkup = `
      <polygon points="${pts(box.leftFace)}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts(box.rightFace)}" fill="${cfg.right}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, box.L, apex])}" fill="${cfg.top}" stroke="${cfg.stroke}" stroke-width="1"/>
      <polygon points="${pts([box.T, apex, box.R])}" fill="${cfg.left}" stroke="${cfg.stroke}" stroke-width="1"/>
    `;
  } else if (cfg.shape === 'tiered') {
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
function buildingSVG(dimension, level) {
  return `<svg viewBox="0 0 100 220" xmlns="http://www.w3.org/2000/svg">${buildingInnerMarkup(dimension, level)}</svg>`;
}

// 把六座建築嵌進一個固定版面的城市場景（含克萊德河背景），純靜態展示用
const CITY_LAYOUT = {
  learning:    { cx: 110, cy: 260 },
  social:      { cx: 300, cy: 210 },
  energy:      { cx: 160, cy: 340 },
  economy:     { cx: 480, cy: 300 },
  exploration: { cx: 560, cy: 260 },
  reflection:  { cx: 360, cy: 380 },
};

function citySceneSVG(levels) {
  const W = 110;
  const H = W * 2.2;
  const buildingsMarkup = Object.keys(CITY_LAYOUT).map((dim) => {
    const { cx, cy } = CITY_LAYOUT[dim];
    const level = (levels && levels[dim] && levels[dim].level) || 1;
    const x = cx - W / 2;
    const y = cy - H;
    return `
      <svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 100 220">${buildingInnerMarkup(dim, level)}</svg>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="13" fill="var(--ink-soft)">${DIM_CONFIG[dim].label}・${level}樓</text>
    `;
  }).join('');

  return `
    <svg width="100%" viewBox="0 0 680 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="格拉斯哥城市示意，六座建築沿克萊德河分布，高度代表等級">
      <rect x="0" y="0" width="680" height="440" fill="var(--card)"/>
      <path d="M -20 300 Q 220 260 360 305 T 700 280" stroke="var(--accent)" stroke-opacity="0.28" stroke-width="36" fill="none" stroke-linecap="round"/>
      <line x1="0" y1="150" x2="680" y2="170" stroke="var(--border)" stroke-width="1"/>
      ${buildingsMarkup}
    </svg>
  `;
}
