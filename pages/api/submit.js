
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

        // 0. 內部撞期檢查 (查 Supabase)
        // 為了防止雙重預約，我們先檢查資料庫是否已經有同一天同一時間的預約紀錄
        // 由於我們把資料存在 message JSON 字串裡，這裡用簡易的字串比對
        const { data: existingBookings, error: checkError } = await supabase
            .from('bookings')
            .select('id')
            .ilike('message', `%"date": "${date}", "time": "${time}"%`);
            
        if (checkError) {
            console.error('Supabase check error:', checkError);
            // 檢查失敗不阻擋，繼續往下
        } else if (existingBookings && existingBookings.length > 0) {
             console.warn('撞期偵測 (Internal Supabase)！該時段已被佔用。');
             return res.status(409).json({ 
                 error: 'Conflict', 
                 message: `抱歉！您選擇的時段 [${date} ${time}] 剛剛被搶先預約了。` 
             });
        }

        // --- Google Calendar 開始 ---
        try {
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
            // 確保格式為 RFC3339 (含時區 +08:00)
            const startDateTime = `${date}T${time}:00+08:00`;
            
            // 計算結束時間 (加 1 小時)
            const startDateObj = new Date(startDateTime);
            const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
            
            // 轉換為台北時間格式字串
            // 技巧：先將時間加 8 小時，轉成 UTC ISO 字串，再把 Z 換成 +08:00
            const tempDate = new Date(endDateObj.getTime());
            tempDate.setUTCHours(tempDate.getUTCHours() + 8);
            const endDateTime = tempDate.toISOString().replace('Z', '+08:00');

            // --- 新增：寫入前的最後檢查 ---
            console.log(`正在進行寫入前的最後撞期檢查 (API)... Start: ${startDateTime}, End: ${endDateTime}`);
            const checkResponse = await calendar.freebusy.query({
                resource: {
                    timeMin: startDateTime,
                    timeMax: endDateTime,
                    timeZone: 'Asia/Taipei',
                    items: [{ id: process.env.GOOGLE_CALENDAR_ID }]
                },
            });

            const busySlots = checkResponse.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy;

            // 如果 busySlots 陣列長度大於 0，表示這個時段已經有行程了
            if (busySlots.length > 0) {
                console.warn('撞期偵測 (API)！該時段已被佔用，拒絕寫入。');
                return res.status(409).json({ 
                    error: 'Conflict', 
                    message: `抱歉！您選擇的時段 [${date} ${time}] 剛剛被搶先預約了。` 
                });
            }

            // 1. 寫入 Supabase (移至撞期檢查後)
            const messageStr = `{"action": "book", "date": "${date}", "time": "${time}", "phone": "${phone}"}`;
            const { error: supabaseError } = await supabase
                .from('bookings')
                .insert([
                    {
                        user_id: userId,
                        message: messageStr,
                        created_at: new Date().toISOString(),
                        // raw_event: null // 這是直接 API 呼叫，沒有原始 LINE 事件
                    },
                ]);

            if (supabaseError) {
                console.error('Supabase 寫入錯誤:', supabaseError);
                // 讓前端知道具體的錯誤訊息，方便除錯 (但既然已經通過撞期檢查，這裡選擇不阻擋，或者回傳錯誤？)
                // 為了保持一致性，如果有 DB 錯誤，最好還是報錯，但日曆寫入邏輯在下面。
                // 這裡選擇記錄錯誤，繼續寫入日曆 (與 webhook.js 保持一致)
            }

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
            try {
                await calendar.events.insert({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    resource: event,
                });
                console.log('Google 日曆寫入成功 (API)');
            } catch (insertError) {
                console.error('Google Calendar Insert Failed:', insertError.response?.data || insertError);
                throw insertError; // 重新拋出錯誤，讓外層 catch 處理
            }

            // 5. 嘗試發送 Push Message 通知使用者 (替代 Reply Message) - 只有在日曆寫入成功後才執行
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

        } catch (googleError) {
            console.error('Google Calendar Error (API):', googleError);
            // 嘗試抓取更詳細的錯誤資訊
            const errorDetails = googleError.response?.data || googleError.message;
            console.error('Detailed Error:', JSON.stringify(errorDetails));

            // 關鍵修改：如果 Google API 失敗，回傳 500 給前端，讓前端顯示錯誤
            return res.status(500).json({ 
                error: 'Calendar Error', 
                message: `日曆連線失敗 (${googleError.message})`,
                details: errorDetails
            });
        }
        // --- Google Calendar 結束 ---

        return res.status(200).json({ success: true, message: 'Booking saved' });

    } catch (error) {
        console.error('Submit API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
