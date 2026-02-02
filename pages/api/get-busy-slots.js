import { google } from 'googleapis';

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

  try {
    // 檢查必要的環境變數
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_CALENDAR_ID) {
        throw new Error('Missing Google environment variables');
    }

    // 4. Google 認證
    // 使用 GoogleAuth 以確保私鑰格式正確處理 (包含換行符號修復)
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: serviceAccountKey.client_email,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // 5. 計算查詢的時間範圍 (台北時間 UTC+8)
    // timeMin: 當天 00:00:00
    const timeMin = `${date}T00:00:00+08:00`;
    
    // timeMax: 隔天 00:00:00
    // 使用 Date 物件計算隔天日期
    const dayObj = new Date(date);
    const nextDayObj = new Date(dayObj);
    nextDayObj.setDate(dayObj.getDate() + 1);
    const nextDate = nextDayObj.toISOString().split('T')[0];
    const timeMax = `${nextDate}T00:00:00+08:00`;

    // 6. 呼叫 Google API 查詢忙碌時段 (Freebusy Query)
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const response = await calendar.freebusy.query({
      resource: {
        timeMin: timeMin,
        timeMax: timeMax,
        timeZone: 'Asia/Taipei',
        items: [{ id: calendarId }],
      },
    });

    // 7. 整理回傳資料
    // Google 回傳結構: response.data.calendars[id].busy 是一個陣列 [{start, end}, ...]
    const busySlots = response.data.calendars[calendarId].busy;
    
    // 回傳 JSON
    return res.status(200).json(busySlots || []);

  } catch (error) {
    console.error('Get Busy Slots Error:', error);
    return res.status(500).json({ 
        error: 'Failed to fetch busy slots', 
        details: error.message 
    });
  }
}
