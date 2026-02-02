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

          // --- Google Calendar 開始 ---
          try {
            const body = JSON.parse(userMessage);

            if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
                throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing');
            }
            
            // 1. 初始化 Google 日曆 API
            const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            
            // 除錯日誌：檢查金鑰結構 (隱藏敏感資訊)
            console.log('Google Credentials Keys:', Object.keys(serviceAccountKey));
            if (!serviceAccountKey.private_key) {
                throw new Error('Missing private_key in GOOGLE_SERVICE_ACCOUNT_KEY');
            }

            // 修正私鑰格式
            const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');

            const auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: serviceAccountKey.client_email,
                    private_key: privateKey,
                    project_id: serviceAccountKey.project_id, // optional but good practice
                },
                scopes: ['https://www.googleapis.com/auth/calendar'],
            });
            
            // 取得已授權的客戶端
            const authClient = await auth.getClient();
            console.log('Google Auth 授權成功');

            const calendar = google.calendar({ version: 'v3', auth: authClient });

            // 2. 準備時間
            // 格式: 2023-10-20T10:00:00
            const startDateTime = `${body.date}T${body.time}:00`;
            
            // 計算結束時間 (加 1 小時)
            const startDateObj = new Date(startDateTime);
            const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
            // 轉回 ISO 格式並去掉毫秒與 Z，保持 "YYYY-MM-DDTHH:mm:ss" 結構
            // 這樣搭配 timeZone: 'Asia/Taipei' 才會被視為當地時間
            const endDateTime = endDateObj.toISOString().split('.')[0];

            // --- 新增：寫入前的最後檢查 ---
            console.log('正在進行寫入前的最後撞期檢查...');
            const checkResponse = await calendar.freebusy.query({
                resource: {
                    timeMin: startDateTime, // ISO 格式
                    timeMax: endDateTime,   // ISO 格式
                    timeZone: 'Asia/Taipei',
                    items: [{ id: process.env.GOOGLE_CALENDAR_ID }]
                },
            });

            const busySlots = checkResponse.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy;

            // 如果 busySlots 陣列長度大於 0，表示這個時段已經有行程了
            if (busySlots.length > 0) {
                console.warn('撞期偵測！該時段已被佔用，拒絕寫入。');
                
                // 呼叫 LINE Reply API 發送失敗訊息
                const replyToken = event.replyToken;
                const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
                
                if (replyToken && accessToken) {
                    await axios.post(
                        'https://api.line.me/v2/bot/message/reply',
                        {
                            replyToken: replyToken,
                            messages: [{
                                type: 'text',
                                text: `❌ 抱歉！您選擇的時段 [${body.date} ${body.time}] 剛剛被搶先預約了。\n\n請重新開啟預約頁面選擇其他時段，謝謝您的體諒。`
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${accessToken}`,
                            },
                        }
                    );
                }
                
                return res.status(200).send('OK'); // 結束這次請求
            }

            // --- 6. 存入 Supabase (移至撞期檢查後) ---
            const { error } = await supabase
              .from('bookings')
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
              // Supabase 寫入失敗不應視為致命錯誤，仍嘗試寫入日曆
            }

            // 3. 建立事件物件
            const eventData = {
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
              resource: eventData,
            });
            console.log('Google 日曆寫入成功');

            // 7. 回覆 LINE 訊息 (只有在日曆寫入成功後才發送)
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
                      text: `✅ 預約已確認！\n日期: ${body.date}\n時間: ${body.time}`,
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

          } catch (googleError) {
            console.error('Google Calendar Error:', googleError);
            
            // 發生錯誤時，回覆使用者系統忙碌中
            const replyToken = event.replyToken;
            const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

            if (replyToken && accessToken) {
                try {
                    await axios.post(
                        'https://api.line.me/v2/bot/message/reply',
                        {
                            replyToken: replyToken,
                            messages: [{
                                type: 'text',
                                text: `⚠️ 系統發生暫時性錯誤，預約未完成。\n\n請稍後再試，或聯絡客服人員。\n錯誤代碼: CalendarAPI`
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${accessToken}`,
                            },
                        }
                    );
                } catch (replyError) {
                    console.error('Error sending error reply:', replyError);
                }
            }
          }
          // --- Google Calendar 結束 ---
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
