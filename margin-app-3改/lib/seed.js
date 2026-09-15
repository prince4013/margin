const DEFAULT_SUGGESTIONS = [
  // 成長類
  { category: 'growth', title: '讀 20 分鐘的書' },
  { category: 'growth', title: '念一段英文、練聽力' },
  { category: 'growth', title: '看一篇 paper 或文獻' },
  { category: 'growth', title: '寫今天的日記' },
  { category: 'growth', title: '整理隨手記裡的想法' },
  // 探索類
  { category: 'explore', title: '去附近沒去過的地方走走' },
  { category: 'explore', title: '在住家附近的公園散步' },
  { category: 'explore', title: '找一間沒吃過的店吃飯' },
  { category: 'explore', title: '隨意逛逛，不設目的地' },
  // 放鬆類
  { category: 'relax', title: '放心地打一場遊戲' },
  { category: 'relax', title: '看一集想看的劇' },
  { category: 'relax', title: '什麼都不做，耍廢一下' },
  { category: 'relax', title: '泡個澡或洗個舒服的澡' },
];

async function seedSuggestions(pool) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM suggestions');
  if (rows[0].count > 0) return;
  for (const s of DEFAULT_SUGGESTIONS) {
    await pool.query('INSERT INTO suggestions (category, title) VALUES ($1, $2)', [
      s.category,
      s.title,
    ]);
  }
  console.log(`已建立 ${DEFAULT_SUGGESTIONS.length} 筆預設活動建議`);
}

module.exports = { seedSuggestions };
