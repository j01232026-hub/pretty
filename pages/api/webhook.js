import { google } from 'googleapis';
const crypto = require('crypto');
const axios = require('axios');
const supabase = require('../../lib/supabaseClient');

// 1. 告訴 Vercel 不要處理 Body，我們要拿原始資料
export const config = {
  api: {
    bodyParser: false,
  },
};

// 小工具：讀取原始資料 (Raw Body)
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    // 2. 確認是 POST 方法
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    // 3. 讀取 Raw Body
    const rawBodyBuffer = await getRawBody(req);
    const rawBody = rawBodyBuffer.toString('utf-8');

    // 4. 驗證身分 (簽名比對)
    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!signature || !channelSecret) {
      return res.status(401).send('Missing signature or channel secret');
    }

    const expectedSignature = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBodyBuffer) // 使用 Buffer 計算更準確
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error('Signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // 5. 處理預約邏輯
    const body = JSON.parse(rawBody);
    const events = body.events || [];

    for (const event of events) {
      // 只處理訊息事件
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;

        // 檢查是否包含預約關鍵字
        if (userMessage.includes('{"action": "book"}')) {
          console.log('收到預約請求:', userMessage);

          // 6. 存入 Supabase
          const { error } = await supabase
            .from('bookings') // 假設資料表叫做 bookings
            .insert([
              {
                user_id: event.source.userId,
                message: userMessage,
                created_at: new Date().toISOString(),
                raw_event: event
              },
            ]);

          if (error) {
            console.error('Supabase 寫入錯誤:', error);
            // 就算資料庫存失敗，可能還是要回覆使用者，或者不回覆視為失敗
            // 這裡選擇繼續嘗試回覆
          }

          // --- Google Calendar 開始 ---
          try {
            const body = JSON.parse(userMessage);
            
            // 1. 初始化 Google 日曆 API
            const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const jwtClient = new google.auth.JWT(
              serviceAccountKey.client_email,
              null,
              serviceAccountKey.private_key,
              ['https://www.googleapis.com/auth/calendar']
            );
            const calendar = google.calendar({ version: 'v3', auth: jwtClient });

            // 2. 準備時間
            // 格式: 2023-10-20T10:00:00
            const startDateTime = `${body.date}T${body.time}:00`;
            
            // 計算結束時間 (加 1 小時)
            const startDateObj = new Date(startDateTime);
            const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
            // 轉回 ISO 格式並去掉毫秒與 Z，保持 "YYYY-MM-DDTHH:mm:ss" 結構
            // 這樣搭配 timeZone: 'Asia/Taipei' 才會被視為當地時間
            const endDateTime = endDateObj.toISOString().split('.')[0];

            // 3. 建立事件物件
            const event = {
              summary: `【新預約】${body.phone}`,
              description: `透過 LINE 預約系統建立`,
              start: {
                dateTime: startDateTime,
                timeZone: 'Asia/Taipei',
              },
              end: {
                dateTime: endDateTime,
                timeZone: 'Asia/Taipei',
              },
            };

            // 4. 寫入日曆
            await calendar.events.insert({
              calendarId: process.env.GOOGLE_CALENDAR_ID,
              resource: event,
            });
            console.log('Google 日曆寫入成功');

          } catch (googleError) {
            console.error('Google Calendar Error:', googleError);
            // 不阻擋後續 LINE 回覆，僅紀錄錯誤
          }
          // --- Google Calendar 結束 ---

          // 7. 回覆 LINE 訊息
          const replyToken = event.replyToken;
          const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

          if (replyToken && accessToken) {
            await axios.post(
              'https://api.line.me/v2/bot/message/reply',
              {
                replyToken: replyToken,
                messages: [
                  {
                    type: 'text',
                    text: '✅ 預約已確認！',
                  },
                ],
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            console.log('預約確認訊息已發送');
          }
        }
      }
    }

    // 8. 回傳 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
