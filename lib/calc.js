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

// 「計畫/行程」(kind='plan') 是藍，強制優先呈現在中心；
// 「今日行動」(kind='action') 是橘，只會出現在外圈，是超出計畫之外的延伸
// 這是輸入當下由使用者明確選擇的，不再用日期反推
function classifyEntry(entry) {
  return entry.kind === 'plan' ? 'scheduled' : 'spontaneous';
}

// 計算某一段期間(periodStart ~ periodEnd，含首尾)內，六個向度各自的 blue/orange/total，
// 以及平均滿意度(avgSatisfaction，跟投入程度分開評分)
function computePeriodBreakdown(entries, periodStart, periodEnd) {
  const startStr = toDateStr(periodStart);
  const endStr = toDateStr(periodEnd);

  const result = {};
  DIMENSIONS.forEach((d) => { result[d] = { blue: 0, orange: 0, total: 0, satisfactionSum: 0, count: 0 }; });

  for (const e of entries) {
    const dateStr = toDateStr(e.event_date);
    if (dateStr < startStr || dateStr > endStr) continue;
    if (!result[e.dimension]) continue;
    const kind = classifyEntry(e);
    const intensity = Number(e.intensity) || 0;
    if (kind === 'scheduled') result[e.dimension].blue += intensity;
    else result[e.dimension].orange += intensity;
    result[e.dimension].total += intensity;
    result[e.dimension].satisfactionSum += Number(e.satisfaction) || 0;
    result[e.dimension].count += 1;
  }

  DIMENSIONS.forEach((d) => {
    result[d].avgSatisfaction = result[d].count > 0
      ? Math.round((result[d].satisfactionSum / result[d].count) * 10) / 10
      : null;
  });

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

// 全時間平均滿意度（給城市建築「色澤」用，1-5，沒有資料時給中性值 3）
function computeCumulativeSatisfaction(entries) {
  const sums = {};
  const counts = {};
  DIMENSIONS.forEach((d) => { sums[d] = 0; counts[d] = 0; });
  for (const e of entries) {
    if (sums[e.dimension] === undefined) continue;
    sums[e.dimension] += Number(e.satisfaction) || 0;
    counts[e.dimension] += 1;
  }
  const avg = {};
  DIMENSIONS.forEach((d) => {
    avg[d] = counts[d] > 0 ? Math.round((sums[d] / counts[d]) * 10) / 10 : 3;
  });
  return avg;
}

// 🎛️ 投入很高、但滿意度偏低的提醒門檻（想調整就改這兩個數字）
const SATISFACTION_LOW_THRESHOLD = 2.5;
const MIN_ENTRIES_FOR_SATISFACTION_ALERT = 2;

// 這一期投入最多的向度，如果平均滿意度偏低，跳出提醒（跟失衡提醒是分開的兩種訊號）
function computeSatisfactionAlert(breakdown) {
  const withData = DIMENSIONS
    .map((d) => ({ dimension: d, ...breakdown[d] }))
    .filter((d) => d.count >= MIN_ENTRIES_FOR_SATISFACTION_ALERT && d.total > 0);
  if (withData.length === 0) return null;

  withData.sort((a, b) => b.total - a.total);
  const top = withData[0];
  if (top.avgSatisfaction !== null && top.avgSatisfaction < SATISFACTION_LOW_THRESHOLD) {
    return { dimension: top.dimension, avgSatisfaction: top.avgSatisfaction };
  }
  return null;
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
  computeCumulativeSatisfaction,
  computeImbalance,
  computeSatisfactionAlert,
  periodRange,
};
