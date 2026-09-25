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

function entryDims(e) {
  return Array.isArray(e.dimensions) ? e.dimensions : [];
}

// 計算某一段期間(periodStart ~ periodEnd，含首尾)內，六個向度各自的：
// investment(投入總量，來自 intensity，一件事可複選多個向度，各自都算全額) 跟
// satisfaction(已評分項目的滿意度原始數值加總/平均，不加權)
function computePeriodBreakdown(entries, periodStart, periodEnd) {
  const startStr = toDateStr(periodStart);
  const endStr = toDateStr(periodEnd);

  const result = {};
  DIMENSIONS.forEach((d) => { result[d] = { investment: 0, satisfactionSum: 0, satisfactionCount: 0, entryCount: 0 }; });

  for (const e of entries) {
    const dateStr = toDateStr(e.event_date);
    if (dateStr < startStr || dateStr > endStr) continue;
    for (const dim of entryDims(e)) {
      if (!result[dim]) continue;
      result[dim].investment += Number(e.intensity) || 0;
      result[dim].entryCount += 1;
      if (e.satisfaction !== null && e.satisfaction !== undefined) {
        result[dim].satisfactionSum += Number(e.satisfaction);
        result[dim].satisfactionCount += 1;
      }
    }
  }

  DIMENSIONS.forEach((d) => {
    result[d].avgSatisfaction = result[d].satisfactionCount > 0
      ? Math.round((result[d].satisfactionSum / result[d].satisfactionCount) * 10) / 10
      : null;
  });

  return result;
}

// 全時間累積（給城市高度用），只看投入量，一件事可複選多個向度、各自都算全額
function computeCumulative(entries) {
  const result = {};
  DIMENSIONS.forEach((d) => { result[d] = 0; });
  for (const e of entries) {
    for (const dim of entryDims(e)) {
      if (result[dim] === undefined) continue;
      result[dim] += Number(e.intensity) || 0;
    }
  }
  return result;
}

// 全時間平均滿意度（給城市建築「色澤」用，1-5，只算已評分的項目，完全沒評過時給中性值 3）
function computeCumulativeSatisfaction(entries) {
  const sums = {};
  const counts = {};
  DIMENSIONS.forEach((d) => { sums[d] = 0; counts[d] = 0; });
  for (const e of entries) {
    if (e.satisfaction === null || e.satisfaction === undefined) continue;
    for (const dim of entryDims(e)) {
      if (sums[dim] === undefined) continue;
      sums[dim] += Number(e.satisfaction);
      counts[dim] += 1;
    }
  }
  const avg = {};
  DIMENSIONS.forEach((d) => {
    avg[d] = counts[d] > 0 ? Math.round((sums[d] / counts[d]) * 10) / 10 : 3;
  });
  return avg;
}

// 失衡提醒：這一期投入量佔比最高 vs 最低的向度，
// 若最高佔比 > 閾值，且最低向度接近 0，跳出提醒
function computeImbalance(breakdown) {
  const totals = DIMENSIONS.map((d) => ({ dimension: d, total: breakdown[d]?.investment || 0 }));
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

// 🎛️ 趨勢圖從這一天開始算（通常設成你開始用這個 app 記錄的日子）
const TREND_START_DATE = '2026-09-14';

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 從 TREND_START_DATE 那一週到現在這一週，總共跨幾週
function weeksSince(startDateStr, now = new Date()) {
  const startMonday = mondayOfWeek(new Date(startDateStr));
  const nowMonday = mondayOfWeek(now);
  const diffDays = Math.round((nowMonday - startMonday) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// 各向度的投入量趨勢：過去 weeks 週(含本週)，每週一個資料點，由舊到新排列
function computeTrend(entries, weeks) {
  const points = [];
  for (let offset = -(weeks - 1); offset <= 0; offset++) {
    const { start, end } = periodRange('week', offset);
    const breakdown = computePeriodBreakdown(entries, start, end);
    const investments = {};
    DIMENSIONS.forEach((d) => { investments[d] = breakdown[d].investment; });
    points.push({
      weekStart: start.toISOString().slice(0, 10),
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      investments,
    });
  }
  return points;
}

module.exports = {
  DIMENSIONS,
  DIMENSION_LABELS,
  LEVEL_THRESHOLDS,
  TREND_START_DATE,
  computeLevel,
  nextLevelInfo,
  computePeriodBreakdown,
  computeCumulative,
  computeCumulativeSatisfaction,
  computeImbalance,
  computeTrend,
  weeksSince,
  periodRange,
};
