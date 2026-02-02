
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

        // 0. 內部撞期檢查 (查 Supabase) - 改為 "寫入後檢查" 模式
        // 先移除這裡的讀取檢查，改用 Optimistic Locking

        // --- Google Calendar 開始 ---
        let insertedBooking = null;
        let eventUrl = '';
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
                console.warn('撞期偵測 (Google Calendar Check)！該時段已被佔用。');
                return res.status(409).json({
                    error: 'Conflict',
                    message: `抱歉！您選擇的時段 [${date} ${time}] 剛剛被搶先預約了 (日曆同步)。`
                });
            }

            // 1. 寫入 Supabase (搶先佔位)
            const messageStr = `{"action": "book", "date": "${date}", "time": "${time}", "phone": "${phone}"}`;
            const { data: bookingData, error: supabaseError } = await supabase
                .from('bookings')
                .insert([
                    {
                        user_id: userId,
                        message: messageStr,
                        created_at: new Date().toISOString(),
                    },
                ])
                .select()
                .single();

            if (supabaseError) {
                console.error('Supabase 寫入錯誤:', supabaseError);
                throw supabaseError;
            }
            insertedBooking = bookingData;

            // 1.5 雙重預約檢查 (Compensating Transaction)
            const { data: duplicateBookings } = await supabase
                .from('bookings')
                .select('id, created_at')
                .ilike('message', `%"date": "${date}", "time": "${time}"%`)
                .order('created_at', { ascending: true });

            if (duplicateBookings && duplicateBookings.length > 1) {
                const firstBooking = duplicateBookings[0];
                if (firstBooking.id !== insertedBooking.id) {
                    console.warn(`雙重預約偵測 (API)！我 (${insertedBooking.id}) 晚了一步。第一筆是 ${firstBooking.id}`);
                    
                    // 補償措施：刪除自己剛寫入的資料
                    await supabase.from('bookings').delete().eq('id', insertedBooking.id);
                    
                    return res.status(409).json({ 
                        error: 'Conflict', 
                        message: `抱歉！您選擇的時段 [${date} ${time}] 剛剛被搶先預約了 (競爭失敗)。` 
                    });
                }
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
                const { data: calendarEvent } = await calendar.events.insert({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    resource: event,
                });
                eventUrl = calendarEvent.htmlLink;
                console.log('Google 日曆寫入成功 (API)', eventUrl);
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
                                    text: `✅ 預約已確認！\n\n日期：${date}\n時間：${time}\n\n請準時到達，謝謝！`
                                }
                            ]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${accessToken}`
                            },
                            timeout: 5000 // 設定 5 秒超時，避免卡死 Vercel Function
                        }
                    );
                    console.log('Push Message sent');
                } catch (pushError) {
                    console.error('Push Message 發送失敗 (可能是額度不足或使用者封鎖):', pushError.response?.data || pushError.message);
                    // 推播失敗不影響預約成功的結果
                }
            }

        } catch (googleError) {
            console.error('Google Calendar Error (API):', googleError);
            
            // 補償措施：如果日曆寫入失敗，刪除 Supabase 中的預約
            if (insertedBooking) {
                console.warn(`日曆寫入失敗 (API)，回滾 Supabase 預約 (${insertedBooking.id})...`);
                await supabase.from('bookings').delete().eq('id', insertedBooking.id);
            }

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

        return res.status(200).json({ 
            success: true, 
            message: 'Booking saved', 
            eventUrl: eventUrl 
        });

    } catch (error) {
        console.error('Submit API Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            message: `系統發生未預期的錯誤 (${error.message})` 
        });
    }
}
