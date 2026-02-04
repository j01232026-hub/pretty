
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
        const { userId, date, time, phone, endTime, name, stylist } = req.body;

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
            // console.log('Google Credentials Keys:', Object.keys(serviceAccountKey));
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
            // console.log('Google Auth 授權成功');

            const calendar = google.calendar({ version: 'v3', auth: authClient });

            // 2. 準備時間
            // 確保格式為 RFC3339 (含時區 +08:00)
            const startDateTime = `${date}T${time}:00+08:00`;
            
            // 計算結束時間
            let endDateTime;
            if (endTime) {
                // 如果前端有傳結束時間 (HH:mm)
                endDateTime = `${date}T${endTime}:00+08:00`;
            } else {
                // 預設加 1 小時
                const startDateObj = new Date(startDateTime);
                const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
                
                // 轉換為台北時間格式字串
                const tempDate = new Date(endDateObj.getTime());
                tempDate.setUTCHours(tempDate.getUTCHours() + 8);
                endDateTime = tempDate.toISOString().replace('Z', '+08:00');
            }

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
                    message: `抱歉！您選擇的時段 [${date} ${time}${endTime ? '-' + endTime : ''}] 剛剛被搶先預約了 (日曆同步)。`
                });
            }

            // 1. 寫入 Supabase (搶先佔位)
            // 儲存 endTime 資訊
            const messageStr = JSON.stringify({
                action: "book",
                date: date,
                time: time,
                startTime: time,
                endTime: endTime || '',
                phone: phone,
                name: name || '',
                stylist: stylist || 'Any Staff'
            });
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

            // 2.5 取得用戶暱稱 (For Google Calendar)
            let nickname = '';
            if (userId && userId !== 'U_GUEST') {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('user_id', userId)
                    .single();
                if (profile) {
                    nickname = profile.display_name || '';
                }
            }

            const summaryName = (name || '').trim();
            const summaryNickname = (nickname || '').trim();
            
            // 邏輯：只有當「姓名」與「暱稱」不相似時，才將暱稱附加上去
            // 如果姓名已經包含暱稱，或兩者完全相同，就只顯示姓名
            let summaryDisplay = summaryName;
            
            if (summaryNickname && summaryName !== summaryNickname && !summaryName.includes(summaryNickname)) {
                 summaryDisplay = `${summaryName}(${summaryNickname})`;
            }

            // 3. 建立事件物件
            const event = {
                summary: `【新預約】${summaryDisplay} ${phone} - ${stylist || 'Any Staff'}`,
                description: `透過 LINE 預約系統建立 (API)\nUser ID: ${userId}\nName: ${name || 'N/A'}\nNickname: ${nickname || 'N/A'}\nStylist: ${stylist || 'Any Staff'}`,
                start: {
                    dateTime: startDateTime,
                    timeZone: 'Asia/Taipei',
                },
                end: {
                    dateTime: endDateTime,
                    timeZone: 'Asia/Taipei',
                },
            };

            // 4. 寫入 Google Calendar
            const insertResponse = await calendar.events.insert({
                calendarId: process.env.GOOGLE_CALENDAR_ID,
                resource: event,
            });
            eventUrl = insertResponse.data.htmlLink;
            console.log('Google Calendar 事件建立成功:', eventUrl);

            // --- 5. 發送 LINE Push Message (通知用戶預約成功) ---
            const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
            if (accessToken && userId && userId !== 'U_GUEST') {
                try {
                    await axios.post(
                        'https://api.line.me/v2/bot/message/push',
                        {
                            to: userId,
                            messages: [{
                                type: 'text',
                                text: `✅ 預約已確認！\n\n設計師：思容Phoebe\n日期：${date}\n時間：${time}${endTime ? '-' + endTime : ''}\n手機：${phone}\n\n請準時到達，謝謝！`
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${accessToken}`,
                            },
                        }
                    );
                    console.log('LINE Push Message sent successfully');
                } catch (lineError) {
                    console.error('LINE Push Message Failed:', lineError.response ? lineError.response.data : lineError.message);
                    // 不阻擋 API 回傳成功，因為預約本身已經成功
                }
            }

            return res.status(200).json({ 
                success: true, 
                message: 'Booking confirmed',
                eventUrl: eventUrl
            });

        } catch (error) {
            console.error('API Error:', error);
            // 如果是我們自己拋出的 supabaseError，這裡會捕捉到
            // 如果已經寫入但後續失敗 (例如 Calendar)，可能需要 Rollback (這裡簡化不處理)
            return res.status(500).json({ 
                error: 'Internal Server Error', 
                message: error.message 
            });
        }
    } catch (outerError) {
        console.error('Outer Error:', outerError);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
