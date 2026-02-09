import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase (如果環境變數不存在，createClient 會報錯或無法運作，需在 handler 內檢查)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  // 1. 檢查請求方法 (只接受 GET)
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2. 從網址參數讀取日期
  const { date, store_id } = req.query;

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
    let busySlots = response.data.calendars[calendarId].busy || [];

    // --- 新增：合併 Supabase 資料庫中的預約 ---
    if (supabase) {
        try {
            // 查詢當天的所有預約 (利用 message 欄位中的 JSON 字串進行模糊搜尋)
            // 格式: "date": "YYYY-MM-DD"
            let query = supabase
                .from('bookings')
                .select('message')
                .ilike('message', `%"date": "${date}"%`);

            // Multi-tenancy filtering
            if (store_id) {
                query = query.eq('store_id', store_id);
            }

            const { data: dbBookings, error } = await query;

            if (!error && dbBookings) {
                const dbSlots = dbBookings.map(booking => {
                    try {
                        const msg = JSON.parse(booking.message);
                        if (msg.time || msg.startTime) {
                            // 組合時間字串，模擬 Google 的格式
                            // Start: YYYY-MM-DDTHH:mm:00+08:00
                            const timeStr = msg.startTime || msg.time;
                            const start = `${msg.date}T${timeStr}:00+08:00`;
                            
                            // 計算結束時間
                            let endIso;
                            if (msg.endTime) {
                                // 如果有明確的 endTime
                                endIso = `${msg.date}T${msg.endTime}:00+08:00`;
                            } else {
                                // 舊邏輯：預設 +1 小時
                                const startDate = new Date(start);
                                const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                                const tzOffset = 8 * 60 * 60 * 1000;
                                endIso = new Date(endDate.getTime() + tzOffset).toISOString().replace('Z', '+08:00');
                            }
                            
                            return {
                                start: start,
                                end: endIso
                            };
                        }
                    } catch (e) {
                        console.error('Error parsing booking message:', e);
                    }
                    return null;
                }).filter(slot => slot !== null);

                // 合併 Google 和 Supabase 的時段
                busySlots = [...busySlots, ...dbSlots];
            }
        } catch (dbError) {
            console.error('Supabase fetch error:', dbError);
            // 資料庫錯誤不應阻擋回傳 Google 的結果
        }
    }
    
    // 回傳 JSON
    return res.status(200).json(busySlots);

  } catch (error) {
    console.error('Get Busy Slots Error:', error);
    return res.status(500).json({ 
        error: 'Failed to fetch busy slots', 
        details: error.message 
    });
  }
}
