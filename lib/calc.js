// 留學生活儀表板 核心計算邏輯

const DIMENSIONS = ['learning', 'social', 'energy', 'economy', 'exploration', 'reflection'];

const DIMENSION_LABELS = {
  learning: '學習',
  social: '社交',
  energy: '能量',
  economy: '經濟',
  exploration: '探索',
  reflection: '反思',
};

// 🎛️ 12 級門檻：累積投入分數達到這個數字，就升到對應等級（1=平房，12=12樓大樓）
// 想調整升級速度，改這個陣列就好
const LEVEL_THRESHOLDS = [0, 10, 25, 45, 70, 100, 135, 175, 220, 270, 325, 385];

function computeLevel(cumulative) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (cumulative >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(12, level);
}

function nextLevelInfo(cumulative) {
  const level = computeLevel(cumulative);
  if (level >= 12) return { level, nextThreshold: null, progress: 1 };
  const currentFloor = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = LEVEL_THRESHOLDS[level];
  const progress = (cumulative - currentFloor) / (nextThreshold - currentFloor);
  return { level, nextThreshold, progress: Math.max(0, Math.min(1, progress)) };
}

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// 判斷一筆紀錄是「事前已知的計畫」(scheduled/藍) 還是「行程外的行動」(spontaneous/橘)
// 規則：輸入當下(created_at)的日期 < 事件日期(event_date) → 計畫；
//       輸入當下的日期 >= 事件日期 → 行程外（當天決定，或事後補登都算）
function classifyEntry(entry) {
  const createdDateStr = toDateStr(entry.created_at);
  const eventDateStr = toDateStr(entry.event_date);
  return createdDateStr < eventDateStr ? 'scheduled' : 'spontaneous';
}

// 計算某一段期間(periodStart ~ periodEnd，含首尾)內，六個向度各自的 blue/orange/total
function computePeriodBreakdown(entries, periodStart, periodEnd) {
  const startStr = toDateStr(periodStart);
  const endStr = toDateStr(periodEnd);

  const result = {};
  DIMENSIONS.forEach((d) => { result[d] = { blue: 0, orange: 0, total: 0 }; });

  for (const e of entries) {
    const dateStr = toDateStr(e.event_date);
    if (dateStr < startStr || dateStr > endStr) continue;
    if (!result[e.dimension]) continue;
    const kind = classifyEntry(e);
    const intensity = Number(e.intensity) || 0;
    if (kind === 'scheduled') result[e.dimension].blue += intensity;
    else result[e.dimension].orange += intensity;
    result[e.dimension].total += intensity;
  }
  return result;
}

// 全時間累積（給城市用），不分 scheduled/spontaneous，也不分期間
function computeCumulative(entries) {
  const result = {};
  DIMENSIONS.forEach((d) => { result[d] = 0; });
  for (const e of entries) {
    if (result[e.dimension] === undefined) continue;
    result[e.dimension] += Number(e.intensity) || 0;
  }
  return result;
}

// 失衡提醒：這一期「實際發生」(blue+orange，即 total) 佔比最高 vs 最低的向度，
// 若最高佔比 > 閾值，且最低向度接近 0，跳出提醒
function computeImbalance(breakdown) {
  const totals = DIMENSIONS.map((d) => ({ dimension: d, total: breakdown[d]?.total || 0 }));
  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  if (grandTotal === 0) return null;

  const withShare = totals.map((t) => ({ ...t, share: t.total / grandTotal }));
  withShare.sort((a, b) => b.share - a.share);
  const highest = withShare[0];
  const lowest = withShare[withShare.length - 1];

  const HIGH_THRESHOLD = 0.4; // 佔比超過 40% 視為過重
  const LOW_THRESHOLD = 0.05; // 佔比低於 5% 視為幾乎掛零

  if (highest.share > HIGH_THRESHOLD && lowest.share < LOW_THRESHOLD) {
    return {
      overloaded: highest.dimension,
      neglected: lowest.dimension,
      overloadedShare: Math.round(highest.share * 100),
    };
  }
  return null;
}

// 週期範圍：week(週一到週日) 或 month(該月 1 號到最後一天)，offset 0=本期，-1=上一期
function periodRange(type, offset, now = new Date()) {
  if (type === 'week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff + offset * 7);
    d.setHours(0, 0, 0, 0);
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  // month
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start, end };
}

module.exports = {
  DIMENSIONS,
  DIMENSION_LABELS,
  LEVEL_THRESHOLDS,
  computeLevel,
  nextLevelInfo,
  classifyEntry,
  computePeriodBreakdown,
  computeCumulative,
  computeImbalance,
  periodRange,
};
