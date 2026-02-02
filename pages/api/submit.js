
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { google } from 'googleapis';

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { userId, date, time, phone } = req.body;

        if (!userId || !date || !time || !phone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. 寫入 Supabase
        const messageStr = `{"action": "book", "date": "${date}", "time": "${time}", "phone": "${phone}"}`;
        
        const { error } = await supabase
            .from('bookings')
            .insert([
                {
                    user_id: userId,
                    message: messageStr,
                    created_at: new Date().toISOString(),
                    // raw_event: null // 這是直接 API 呼叫，沒有原始 LINE 事件
                },
            ]);

        if (error) {
            console.error('Supabase 寫入錯誤:', error);
            // 讓前端知道具體的錯誤訊息，方便除錯
            return res.status(500).json({ error: 'Database error', details: error.message });
        }

        // --- Google Calendar 開始 ---
        try {
            // 1. 初始化 Google 日曆 API
            const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            
            // 修正私鑰格式 (處理 Vercel 環境變數中的換行符號問題)
            const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');

            const jwtClient = new google.auth.JWT(
                serviceAccountKey.client_email,
                null,
                privateKey,
                ['https://www.googleapis.com/auth/calendar']
            );
            
            // 明確執行授權
            await jwtClient.authorize();
            console.log('Google Auth 授權成功');

            const calendar = google.calendar({ version: 'v3', auth: jwtClient });

            // 2. 準備時間
            const startDateTime = `${date}T${time}:00`;
            
            // 計算結束時間 (加 1 小時)
            const startDateObj = new Date(startDateTime);
            const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
            const endDateTime = endDateObj.toISOString().split('.')[0];

            // 3. 建立事件物件
            const event = {
                summary: `【新預約】${phone}`,
                description: `透過 LINE 預約系統建立 (API)`,
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
            console.log('Google 日曆寫入成功 (API)');

        } catch (googleError) {
            console.error('Google Calendar Error (API):', googleError);
            // 不阻擋後續回覆
        }
        // --- Google Calendar 結束 ---

        // 2. 嘗試發送 Push Message 通知使用者 (替代 Reply Message)
        const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (accessToken && userId) {
            try {
                await axios.post(
                    'https://api.line.me/v2/bot/message/push',
                    {
                        to: userId,
                        messages: [
                            {
                                type: 'text',
                                text: `✅ 預約已確認！\n日期: ${date}\n時間: ${time}`,
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
            } catch (pushError) {
                console.error('Push Message 發送失敗 (可能是額度不足或使用者封鎖):', pushError.response?.data || pushError.message);
                // 推播失敗不影響預約成功的結果
            }
        }

        return res.status(200).json({ success: true, message: 'Booking saved' });

    } catch (error) {
        console.error('Submit API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
