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

// ================= ENTRIES（六向度紀錄）=================
app.post('/api/entries', async (req, res) => {
  const { dimension, event_date, description, intensity } = req.body;
  if (!calc.DIMENSIONS.includes(dimension)) {
    return res.status(400).json({ error: '向度不正確' });
  }
  if (!description || !event_date) {
    return res.status(400).json({ error: '缺少日期或描述' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO entries (dimension, event_date, description, intensity)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [dimension, event_date, description, intensity || 3]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '新增紀錄失敗：' + err.message });
  }
});

app.get('/api/entries', async (req, res) => {
  const { dimension } = req.query;
  try {
    const { rows } = dimension
      ? await pool.query(
          'SELECT * FROM entries WHERE dimension = $1 ORDER BY event_date DESC, created_at DESC',
          [dimension]
        )
      : await pool.query('SELECT * FROM entries ORDER BY event_date DESC, created_at DESC LIMIT 200');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取紀錄失敗：' + err.message });
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

// ================= DASHBOARD（六角形：這一期的 blue/orange/total）=================
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
    res.json({
      period: type,
      offset,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      breakdown,
      imbalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取儀表板失敗：' + err.message });
  }
});

// ================= CUMULATIVE（城市：全時間累積 + 等級）=================
app.get('/api/cumulative', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT dimension, intensity FROM entries');
    const cumulative = calc.computeCumulative(rows);
    const withLevel = {};
    Object.keys(cumulative).forEach((d) => {
      withLevel[d] = { cumulative: cumulative[d], ...calc.nextLevelInfo(cumulative[d]) };
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

// 把一筆隨手記轉成正式紀錄：帶 dimension/event_date/intensity 進來，內容沿用隨手記的文字
app.post('/api/notes/:id/promote', async (req, res) => {
  const { dimension, event_date, intensity } = req.body;
  if (!calc.DIMENSIONS.includes(dimension) || !event_date) {
    return res.status(400).json({ error: '缺少向度或日期' });
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
      `INSERT INTO entries (dimension, event_date, description, intensity)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [dimension, event_date, note.content, intensity || 3]
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

// ================= BUILDING LOCATIONS（城市地圖上六個向度的釘點）=================
app.get('/api/building-locations', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM building_locations');
    const map = {};
    rows.forEach((r) => { map[r.dimension] = r; });
    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '讀取地點失敗：' + err.message });
  }
});

app.post('/api/building-locations', async (req, res) => {
  const { dimension, lat, lng, place_name } = req.body;
  if (!calc.DIMENSIONS.includes(dimension) || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: '缺少向度或座標' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO building_locations (dimension, lat, lng, place_name)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (dimension) DO UPDATE SET lat = $2, lng = $3, place_name = $4
       RETURNING *`,
      [dimension, lat, lng, place_name || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '儲存地點失敗：' + err.message });
  }
});

// ================= 測試用途：清空所有資料 =================
app.post('/api/reset-test-data', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE entries, quick_notes, building_locations RESTART IDENTITY');
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
