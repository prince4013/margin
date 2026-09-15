const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const { seedSuggestions } = require('./lib/seed');
const {
  computeMargin,
  computeWeeklyBurdenHistogram,
  isAcuteExpired,
} = require('./lib/calc');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const GROWTH_CATEGORIES = ['skill', 'stamina', 'mental', 'knowledge', 'life', 'economic'];
// 完成清單分類 -> 成長軸線對應
const COMPLETION_TO_GROWTH = {
  '功課': 'skill',
  '工作': 'economic',
  '身體健康': 'stamina',
  '心理照顧': 'mental',
  '自我成長': 'knowledge',
  '家務財務': 'life',
};
const WEEKLY_CATEGORIES = ['課業', '工作', '聚會', '出遊'];

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  await seedSuggestions(pool);
  console.log('資料庫結構已就緒');
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 清掉已經過期的 acute 事件（自動刪除）
async function cleanupExpiredAcuteEvents() {
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE type = 'acute' AND status = 'active'`
  );
  const expiredIds = rows.filter((e) => isAcuteExpired(e)).map((e) => e.id);
  if (expiredIds.length > 0) {
    await pool.query('DELETE FROM events WHERE id = ANY($1::int[])', [expiredIds]);
  }
}

async function fetchActiveEvents() {
  await cleanupExpiredAcuteEvents();
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE status = 'active' ORDER BY event_date DESC, created_at DESC`
  );
  return rows;
}

// ================= EVENTS（負擔事件：acute / chronic / todo）=================
app.get('/api/events', async (req, res) => {
  try {
    const events = await fetchActiveEvents();
    res.json(events.filter((e) => e.type !== 'effort'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取事件失敗' });
  }
});

app.post('/api/events', async (req, res) => {
  const { type, title, category, initial_burden, decay_speed, event_date } = req.body;
  if (!type || !title) return res.status(400).json({ error: '缺少 type 或 title' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO events (type, title, category, initial_burden, decay_speed, event_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        type, title, category || '未分類', initial_burden ?? 10,
        decay_speed || 'medium', event_date || todayStr(),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增事件失敗' });
  }
});

// chronic：點選 10 點量表中的第 N 點，設定 progress = N
app.patch('/api/events/:id/progress', async (req, res) => {
  const dots = Math.max(0, Math.min(10, Number(req.body.dots)));
  try {
    const updates = ['progress = $1'];
    const values = [dots, req.params.id];
    if (dots >= 10) updates.push(`status = 'resolved'`, `resolved_at = now()`);
    const { rows } = await pool.query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = $2 RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新進度失敗' });
  }
});

// todo：標記已解決
app.patch('/api/events/:id/resolve', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE events SET status = 'resolved', resolved_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新事件失敗' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '刪除事件失敗' });
  }
});

// ================= 完成清單（effort 型，獨立列表）=================
const LIGHTNESS_MAP = { small: 5, medium: 12, large: 20 };

app.get('/api/completions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM events WHERE type = 'effort' ORDER BY event_date DESC, created_at DESC LIMIT 30`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取完成清單失敗' });
  }
});

app.post('/api/completions', async (req, res) => {
  const { title, category, lightness, event_date } = req.body;
  if (!title || !COMPLETION_TO_GROWTH[category]) {
    return res.status(400).json({ error: '缺少 title 或分類不正確' });
  }
  const magnitude = LIGHTNESS_MAP[lightness] || LIGHTNESS_MAP.medium;
  const evDate = event_date || todayStr();

  try {
    const { rows } = await pool.query(
      `INSERT INTO events (type, title, category, initial_burden, event_date)
       VALUES ('effort', $1, $2, $3, $4) RETURNING *`,
      [title, category, magnitude, evDate]
    );
    const growthCategory = COMPLETION_TO_GROWTH[category];
    await pool.query(
      'INSERT INTO growth_stats (category, amount, note) VALUES ($1, 1, $2)',
      [growthCategory, title]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增完成項目失敗' });
  }
});

// ================= QUICK NOTES（隨手記）=================
app.get('/api/notes', async (req, res) => {
  const untriagedOnly = req.query.untriaged === 'true';
  try {
    const { rows } = await pool.query(
      untriagedOnly
        ? `SELECT * FROM quick_notes WHERE triaged = FALSE ORDER BY created_at DESC`
        : `SELECT * FROM quick_notes ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取隨手記失敗' });
  }
});

app.post('/api/notes', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '內容不可為空' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO quick_notes (content) VALUES ($1) RETURNING *',
      [content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增隨手記失敗' });
  }
});

app.patch('/api/notes/:id/triage', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE quick_notes SET triaged = TRUE, triaged_at = now() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新隨手記失敗' });
  }
});

// ================= GROWTH STATS（六軸成長，合併呈現於儀表板）=================
app.get('/api/growth/summary', async (req, res) => {
  try {
    const { rows: totals } = await pool.query(
      `SELECT category, COALESCE(SUM(amount),0)::float AS total
       FROM growth_stats GROUP BY category`
    );
    const totalsMap = Object.fromEntries(GROWTH_CATEGORIES.map((c) => [c, 0]));
    totals.forEach((t) => { if (totalsMap[t.category] !== undefined) totalsMap[t.category] = t.total; });
    res.json({ totals: totalsMap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取成長總覽失敗' });
  }
});

// ================= WEEKLY PLAN（本週規劃：課業/工作/聚會/出遊 + 日期）=================
app.get('/api/weekly-plan/current', async (req, res) => {
  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query('SELECT * FROM weekly_plans WHERE week_start = $1', [weekStart]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取本週規劃失敗' });
  }
});

app.post('/api/weekly-plan', async (req, res) => {
  const { items } = req.body; // [{title, category(課業/工作/聚會/出遊), initial_burden, event_date}]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必須是陣列' });

  const weekStartDate = mondayOf(new Date());
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const itemsWithDefaults = items.map((it) => ({ ...it, decay_speed: it.decay_speed || 'medium' }));

  try {
    const histogram = computeWeeklyBurdenHistogram(itemsWithDefaults, weekStartDate);

    await pool.query(
      `INSERT INTO weekly_plans (week_start, items, predicted_curve)
       VALUES ($1,$2,$3)
       ON CONFLICT (week_start) DO UPDATE SET items = $2, predicted_curve = $3`,
      [weekStart, JSON.stringify(itemsWithDefaults), JSON.stringify(histogram)]
    );

    for (const item of itemsWithDefaults) {
      await pool.query(
        `INSERT INTO events (type, title, category, initial_burden, decay_speed, event_date)
         VALUES ('acute', $1, $2, $3, $4, $5)`,
        [item.title, item.category, item.initial_burden ?? 15, item.decay_speed, item.event_date]
      );
    }

    res.status(201).json({ week_start: weekStart, items: itemsWithDefaults, predicted_curve: histogram });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '儲存本週規劃失敗' });
  }
});

// ================= SUGGESTIONS =================
app.get('/api/suggestion/random', async (req, res) => {
  const { category } = req.query;
  try {
    let cat = category;
    if (!cat) {
      const cats = ['growth', 'explore', 'relax'];
      cat = cats[Math.floor(Math.random() * cats.length)];
    }
    const { rows } = await pool.query(
      'SELECT * FROM suggestions WHERE category = $1 ORDER BY random() LIMIT 1',
      [cat]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取建議失敗' });
  }
});

// ================= MARGIN =================
app.get('/api/margin', async (req, res) => {
  try {
    const events = await fetchActiveEvents(); // 含 effort，用於計算加成
    const { rows: noteRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM quick_notes WHERE triaged = FALSE'
    );
    const untriagedCount = noteRows[0].count;
    const result = computeMargin(events, untriagedCount);

    await pool.query(
      `INSERT INTO daily_margin (date, margin, breakdown)
       VALUES ($1,$2,$3)
       ON CONFLICT (date) DO UPDATE SET margin = $2, breakdown = $3`,
      [todayStr(), result.margin, JSON.stringify(result.breakdown)]
    );

    res.json({ ...result, untriagedCount, showSuggestion: result.margin > 20 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '計算餘裕值失敗' });
  }
});

app.get('/api/margin/trend', async (req, res) => {
  const days = Math.min(60, Number(req.query.days) || 14);
  try {
    const { rows } = await pool.query('SELECT * FROM daily_margin ORDER BY date DESC LIMIT $1', [days]);
    res.json(rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取趨勢失敗' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`餘裕管理 App 已啟動：http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('資料庫初始化失敗', err);
    process.exit(1);
  });
