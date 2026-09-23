// 六向度建築造型設定：每個向度固定一種造型 + 一組顏色，高度依等級變化
const DIM_CONFIG = {
  learning: { label: '學習', shape: 'plain', top: '#CECBF6', left: '#AFA9EC', right: '#7F77DD', stroke: '#534AB7' },
  social: { label: '社交', shape: 'pyramid', top: '#F4C0D1', left: '#ED93B1', right: '#D4537E', stroke: '#993556' },
  energy: { label: '能量', shape: 'dome', top: '#FAC775', left: '#EF9F27', right: '#BA7517', stroke: '#854F0B' },
  economy: { label: '經濟', shape: 'tiered', top: '#9FE1CB', left: '#5DCAA5', right: '#1D9E75', stroke: '#0F6E56' },
  exploration: { label: '探索', shape: 'lean', top: '#F5C4B3', left: '#F0997B', right: '#D85A30', stroke: '#993C1D' },
  reflection: { label: '反思', shape: 'plain', top: '#D3D1C7', left: '#B4B2A9', right: '#888780', stroke: '#5F5E5A' },
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

// 產生一座建築的 SVG 字串，viewBox 固定 0 0 100 220，等級 1-12
function buildingSVG(dimension, level) {
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

  return `<svg viewBox="0 0 100 220" xmlns="http://www.w3.org/2000/svg">${shapeMarkup}${lines}</svg>`;
}
