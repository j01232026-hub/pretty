export default async function handler(req, res) {
  // 1. 檢查請求方法 (只接受 GET)
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2. 從網址參數讀取日期
  const { date } = req.query;

  // 3. 檢查 date 是否存在
  if (!date) {
    return res.status(400).json({ error: 'Missing date parameter' });
  }

  // 4. 回傳測試 JSON
  return res.status(200).json({ message: "準備查詢日期", date: date });
}
