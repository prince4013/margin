const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const calc = require('./lib/calc');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('資料庫結構已就緒');
}

// ================= ENTRIES（事情為主，向度可複選）=================
function validDimensions(dimensions) {
  return Array.isArray(dimensions) && dimensions.length > 0 && dimensions.every((d) => calc.DIMENSIONS.includes(d));
}

app.post('/api/entries', async (req, res) => {
  const { dimensions, event_date, description, intensity } = req.body;
  if (!validDimensions(dimensions)) {
    return res.status(400).json({ error: '請至少選擇一個向度' });
  }
  if (!description || !event_date) {
    return res.status(400).json({ error: '缺少日期或描述' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO entries (dimensions, event_date, description, intensity)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [dimensions, event_date, description, intensity || 3]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增紀錄失敗：' + err.message });
  }
});

app.get('/api/entries', async (req, res) => {
  const { dimension, upcoming, unrated, week_offset } = req.query;
  try {
    const conditions = [];
    const params = [];
    if (dimension) { params.push(dimension); conditions.push(`$${params.length} = ANY(dimensions)`); }
    if (upcoming === 'true') { conditions.push(`event_date > CURRENT_DATE`); }
    if (unrated === 'true') { conditions.push(`event_date <= CURRENT_DATE`); }
    if (week_offset !== undefined) {
      const { start, end } = calc.periodRange('week', Number(week_offset) || 0);
      params.push(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
      conditions.push(`event_date >= $${params.length - 1} AND event_date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = upcoming === 'true' ? 'ORDER BY event_date ASC' : 'ORDER BY event_date DESC, created_at DESC';
    const limit = upcoming === 'true' || week_offset !== undefined ? '' : 'LIMIT 200';
    const { rows } = await pool.query(`SELECT * FROM entries ${where} ${order} ${limit}`, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取紀錄失敗：' + err.message });
  }
});

// 編輯一筆紀錄（向度、日期、描述、投入程度）
app.patch('/api/entries/:id', async (req, res) => {
  const { dimensions, event_date, description, intensity } = req.body;
  if (!validDimensions(dimensions)) {
    return res.status(400).json({ error: '請至少選擇一個向度' });
  }
  if (!description || !event_date) {
    return res.status(400).json({ error: '缺少日期或描述' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE entries SET dimensions = $1, event_date = $2, description = $3, intensity = $4 WHERE id = $5 RETURNING *`,
      [dimensions, event_date, description, intensity || 3, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '找不到這筆紀錄' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新紀錄失敗：' + err.message });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '刪除紀錄失敗：' + err.message });
  }
});

// 事後評分滿意度（1-5），或傳 null 清掉已評的分數
app.patch('/api/entries/:id/satisfaction', async (req, res) => {
  const { satisfaction } = req.body;
  if (satisfaction !== null && (satisfaction < 1 || satisfaction > 5)) {
    return res.status(400).json({ error: '滿意度必須是 1-5 或 null' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE entries SET satisfaction = $1 WHERE id = $2 RETURNING *',
      [satisfaction, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '找不到這筆紀錄' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新滿意度失敗：' + err.message });
  }
});

// ================= DASHBOARD（六角形：這一期的投入量 + 已評分的滿意度）=================
app.get('/api/dashboard', async (req, res) => {
  const type = req.query.period === 'month' ? 'month' : 'week';
  const offset = Number(req.query.offset) || 0;
  try {
    const { start, end } = calc.periodRange(type, offset);
    const { rows } = await pool.query(
      'SELECT * FROM entries WHERE event_date >= $1 AND event_date <= $2',
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
    const breakdown = calc.computePeriodBreakdown(rows, start, end);
    const imbalance = calc.computeImbalance(breakdown);
    const satisfactionAlert = calc.computeSatisfactionAlert(breakdown);
    res.json({
      period: type,
      offset,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      breakdown,
      imbalance,
      satisfactionAlert,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取儀表板失敗：' + err.message });
  }
});

// ================= CUMULATIVE（城市：全時間累積 + 等級）=================
app.get('/api/cumulative', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT dimensions, intensity, satisfaction FROM entries');
    const cumulative = calc.computeCumulative(rows);
    const avgSatisfaction = calc.computeCumulativeSatisfaction(rows);
    const withLevel = {};
    Object.keys(cumulative).forEach((d) => {
      withLevel[d] = { cumulative: cumulative[d], avgSatisfaction: avgSatisfaction[d], ...calc.nextLevelInfo(cumulative[d]) };
    });
    res.json(withLevel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取累積成長失敗：' + err.message });
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
    res.status(500).json({ error: '讀取隨手記失敗：' + err.message });
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
    res.status(500).json({ error: '新增隨手記失敗：' + err.message });
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
    res.status(500).json({ error: '更新隨手記失敗：' + err.message });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quick_notes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '刪除隨手記失敗：' + err.message });
  }
});

// 把一筆隨手記轉成正式紀錄：帶 dimensions(可複選)/event_date/intensity 進來，內容沿用隨手記的文字。
// 滿意度先不填，事後在「滿意度」頁面再評
app.post('/api/notes/:id/promote', async (req, res) => {
  const { dimensions, event_date, intensity } = req.body;
  if (!validDimensions(dimensions) || !event_date) {
    return res.status(400).json({ error: '請至少選擇一個向度，並確認日期' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: noteRows } = await client.query('SELECT * FROM quick_notes WHERE id = $1', [req.params.id]);
    if (noteRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '找不到這筆隨手記' });
    }
    const note = noteRows[0];
    const { rows: entryRows } = await client.query(
      `INSERT INTO entries (dimensions, event_date, description, intensity)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [dimensions, event_date, note.content, intensity || 3]
    );
    await client.query('UPDATE quick_notes SET triaged = TRUE, triaged_at = now() WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(entryRows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: '轉為正式紀錄失敗：' + err.message });
  } finally {
    client.release();
  }
});

// ================= 測試用途：清空所有資料 =================
app.post('/api/reset-test-data', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE entries, quick_notes RESTART IDENTITY');
    res.json({ ok: true });
  } catch (err) {
    console.error('清空測試資料失敗', err);
    res.status(500).json({ error: '清空測試資料失敗：' + err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`留學生活儀表板已啟動：http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('資料庫初始化失敗', err);
    process.exit(1);
  });
