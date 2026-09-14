const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const { seedSuggestions } = require('./lib/seed');
const {
  computeMargin,
  computePredictedWeek,
} = require('./lib/calc');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ---------- 啟動時自動建表 + 種子資料 ----------
async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  await seedSuggestions(pool);
  console.log('資料庫結構已就緒');
}

// ---------- 小工具 ----------
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchActiveEventsWithMilestones() {
  const { rows: events } = await pool.query(
    `SELECT * FROM events WHERE status = 'active' ORDER BY created_at DESC`
  );
  const { rows: milestones } = await pool.query('SELECT * FROM milestones');
  const byEvent = {};
  for (const m of milestones) {
    if (!byEvent[m.event_id]) byEvent[m.event_id] = [];
    byEvent[m.event_id].push(m);
  }
  return events.map((e) => ({ ...e, milestones: byEvent[e.id] || [] }));
}

// ================= EVENTS =================
app.get('/api/events', async (req, res) => {
  try {
    const events = await fetchActiveEventsWithMilestones();
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取事件失敗' });
  }
});

app.post('/api/events', async (req, res) => {
  const {
    type, title, category, initial_burden, decay_speed,
    is_recurring, recurrence_rule, anxious, milestones,
  } = req.body;

  if (!type || !title) {
    return res.status(400).json({ error: '缺少 type 或 title' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO events (type, title, category, initial_burden, decay_speed, is_recurring, recurrence_rule, anxious)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        type, title, category || '未分類', initial_burden ?? 10,
        decay_speed || 'medium', !!is_recurring, recurrence_rule || null, !!anxious,
      ]
    );
    const event = rows[0];

    if (type === 'staged' && Array.isArray(milestones)) {
      for (const m of milestones) {
        await pool.query(
          'INSERT INTO milestones (event_id, label, release_percent) VALUES ($1,$2,$3)',
          [event.id, m.label, m.release_percent]
        );
      }
    }
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增事件失敗' });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const fields = ['progress', 'anxious', 'status', 'title', 'category'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f]);
    }
  }
  if (req.body.status === 'resolved') {
    updates.push(`resolved_at = now()`);
  }
  if (updates.length === 0) return res.status(400).json({ error: '沒有可更新的欄位' });

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新事件失敗' });
  }
});

app.post('/api/events/:id/milestones/:mid/complete', async (req, res) => {
  const { id, mid } = req.params;
  try {
    await pool.query(
      'UPDATE milestones SET completed = TRUE, completed_at = now() WHERE id = $1 AND event_id = $2',
      [mid, id]
    );
    const { rows: msRows } = await pool.query('SELECT * FROM milestones WHERE event_id = $1', [id]);
    const releasedTotal = msRows.filter((m) => m.completed)
      .reduce((s, m) => s + Number(m.release_percent || 0), 0);
    if (releasedTotal >= 100) {
      await pool.query(`UPDATE events SET status = 'resolved', resolved_at = now() WHERE id = $1`, [id]);
    }
    res.json({ ok: true, releasedTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新里程碑失敗' });
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

// ================= GROWTH STATS（長期投資成長軸）=================
app.post('/api/growth', async (req, res) => {
  const { category, amount, note } = req.body;
  if (!['knowledge', 'stamina', 'mental'].includes(category)) {
    return res.status(400).json({ error: 'category 必須是 knowledge / stamina / mental' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO growth_stats (category, amount, note) VALUES ($1,$2,$3) RETURNING *',
      [category, amount ?? 1, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增成長紀錄失敗' });
  }
});

app.get('/api/growth/summary', async (req, res) => {
  try {
    const { rows: totals } = await pool.query(
      `SELECT category, COALESCE(SUM(amount),0)::float AS total
       FROM growth_stats GROUP BY category`
    );
    const { rows: history } = await pool.query(
      `SELECT category, amount, note, created_at FROM growth_stats
       ORDER BY created_at DESC LIMIT 50`
    );
    const totalsMap = { knowledge: 0, stamina: 0, mental: 0 };
    totals.forEach((t) => { totalsMap[t.category] = t.total; });
    res.json({ totals: totalsMap, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取成長總覽失敗' });
  }
});

// ================= WEEKLY PLAN（每週規劃）=================
app.get('/api/weekly-plan/current', async (req, res) => {
  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      'SELECT * FROM weekly_plans WHERE week_start = $1',
      [weekStart]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取本週規劃失敗' });
  }
});

app.post('/api/weekly-plan', async (req, res) => {
  const { items } = req.body; // [{title, type, category, initial_burden, decay_speed, expected_day_index}]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必須是陣列' });

  const weekStartDate = mondayOf(new Date());
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  try {
    const predicted_curve = computePredictedWeek(items, weekStartDate);

    await pool.query(
      `INSERT INTO weekly_plans (week_start, items, predicted_curve)
       VALUES ($1,$2,$3)
       ON CONFLICT (week_start) DO UPDATE SET items = $2, predicted_curve = $3`,
      [weekStart, JSON.stringify(items), JSON.stringify(predicted_curve)]
    );

    // 同步建立真正的事件，讓本週規劃即刻反映在餘裕值計算中
    for (const item of items) {
      const expDate = new Date(weekStartDate);
      expDate.setDate(expDate.getDate() + (item.expected_day_index ?? 0));
      await pool.query(
        `INSERT INTO events (type, title, category, initial_burden, decay_speed, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          item.type || 'emotion', item.title, item.category || '未分類',
          item.initial_burden ?? 10, item.decay_speed || 'medium', expDate,
        ]
      );
    }

    res.status(201).json({ week_start: weekStart, items, predicted_curve });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '儲存本週規劃失敗' });
  }
});

// ================= SUGGESTIONS（餘裕使用建議）=================
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

// ================= MARGIN（餘裕值計算）=================
app.get('/api/margin', async (req, res) => {
  try {
    const events = await fetchActiveEventsWithMilestones();
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
    const { rows } = await pool.query(
      `SELECT * FROM daily_margin ORDER BY date DESC LIMIT $1`,
      [days]
    );
    res.json(rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取趨勢失敗' });
  }
});

// SPA fallback
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
