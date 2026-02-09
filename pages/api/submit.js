
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
        const { 
            userId, 
            date, 
            time, 
            phone, 
            endTime, 
            name, 
            stylist, 
            pictureUrl, 
            type = 'regular', // default type
            admin_override = false,
            isAllDay = false,
            store_id // Add store_id
        } = req.body;
        
        console.log('Received booking request:', { userId, date, time, stylist, type, admin_override, isAllDay, store_id });

        // Validation logic
        if (!date || (!time && !isAllDay)) {
             return res.status(400).json({ error: 'Missing required fields (date or time)' });
        }
        
        // Ensure store_id is present for multi-tenancy
        if (!store_id) {
             return res.status(400).json({ error: 'Missing required fields (store_id)' });
        }

        // For 'block' type, userId is optional. For 'regular' and 'staff_booking', userId or phone/name might be needed
        // Relaxing checks: if it's a block, we don't strictly need user info, but we need date/time/stylist usually.
        // For compatibility, if type is regular, we keep strict checks unless it's an admin override scenario?
        // Let's keep it simple: if not 'block', we expect phone to be present usually for contact.
        if (type !== 'block' && !phone) {
             // For guest bookings or staff bookings for a client, phone is essential
             return res.status(400).json({ error: 'Missing required fields (phone)' });
        }
        
        // Update User Profile with Picture (Upsert) - Only for regular users
        if (userId && userId !== 'U_GUEST' && type === 'regular') {
            try {
                const profileUpdates = {
                    user_id: userId,
                    display_name: name,
                    updated_at: new Date().toISOString()
                };
                if (pictureUrl) {
                    profileUpdates.picture_url = pictureUrl;
                }
                
                // Fire and forget profile update to avoid blocking booking
                supabase.from('profiles').upsert(profileUpdates, { onConflict: 'user_id' }).then(({ error }) => {
                    if (error) console.error('Profile update error:', error);
                });
            } catch (err) {
                console.error('Profile update exception:', err);
            }
        }

        // --- Google Calendar 開始 ---
        let insertedBooking = null;
        let eventUrl = '';
        try {
            if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
                throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing');
            }

            // 1. 初始化 Google 日曆 API
            const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            
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
            const calendar = google.calendar({ version: 'v3', auth: authClient });

            // 2. 準備時間
            let startDateTime, endDateTime;

            if (isAllDay) {
                // For conflict check and DB record, we use full day range
                startDateTime = `${date}T00:00:00+08:00`;
                // End of day for conflict check
                endDateTime = `${date}T23:59:59+08:00`;
            } else {
                // 確保格式為 RFC3339 (含時區 +08:00)
                startDateTime = `${date}T${time}:00+08:00`;
                
                // 計算結束時間
                if (endTime) {
                    endDateTime = `${date}T${endTime}:00+08:00`;
                } else {
                    const startDateObj = new Date(startDateTime);
                    const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
                    
                    const tempDate = new Date(endDateObj.getTime());
                    tempDate.setUTCHours(tempDate.getUTCHours() + 8);
                    endDateTime = tempDate.toISOString().replace('Z', '+08:00');
                }
            }

            // --- 新增：寫入前的最後檢查 ---
            // 如果是 admin_override = true，則跳過 Google Calendar 撞期檢查
            if (!admin_override) {
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

                if (busySlots.length > 0) {
                    console.warn('撞期偵測 (Google Calendar Check)！該時段已被佔用。');
                    return res.status(409).json({
                        error: 'Conflict',
                        message: `抱歉！您選擇的時段 [${date} ${time}${endTime ? '-' + endTime : ''}] 剛剛被搶先預約了 (日曆同步)。`
                    });
                }
            } else {
                console.log('Admin override enabled: Skipping Google Calendar conflict check.');
            }

            // 1. 寫入 Supabase (搶先佔位)
            const messageStr = JSON.stringify({
                action: "book",
                type: type, // 記錄預約類型
                date: date,
                time: isAllDay ? 'All Day' : time,
                startTime: isAllDay ? '00:00' : time,
                isAllDay: isAllDay,
                endTime: endTime || '',
                phone: phone || '',
                name: name || '',
                stylist: stylist || 'Any Staff',
                pictureUrl: pictureUrl || ''
            });

            // --- 0. 寫入前檢查 (Read Check) - 只針對非 block 類型 ---
            if (userId && type !== 'block') {
                const { data: existingBookings } = await supabase
                    .from('bookings')
                    .select('id')
                    .ilike('message', `%"date": "${date}", "time": "${time}"%`)
                    .eq('user_id', userId);

                if (existingBookings && existingBookings.length > 0) {
                    console.warn('使用者重複提交預約，嘗試刪除舊資料以允許覆蓋');
                    for (const booking of existingBookings) {
                        await supabase.from('bookings').delete().eq('id', booking.id);
                    }
                }
            }
            
            // 構建 insert 物件
            const insertPayload = {
                message: messageStr,
                created_at: new Date().toISOString(),
                type: type, // 新增欄位
                store_id: store_id // Add store_id to insert
            };
            if (userId) insertPayload.user_id = userId; // 只有當 userId 存在時才寫入，否則為 null

            const { data: bookingData, error: supabaseError } = await supabase
                .from('bookings')
                .insert([insertPayload])
                .select()
                .single();

            if (supabaseError) {
                console.error('Supabase 寫入錯誤:', supabaseError);
                throw new Error(`Database Write Failed: ${supabaseError.message}`);
            }
            insertedBooking = bookingData;
            console.log(`Supabase 寫入成功 ID: ${insertedBooking.id}`);

            // 1.5 雙重預約檢查 (Compensating Transaction) - 僅在非 admin_override 時執行
            if (!admin_override) {
                const { data: duplicateBookings } = await supabase
                    .from('bookings')
                    .select('id, created_at')
                    .ilike('message', `%"date": "${date}", "time": "${time}"%`)
                    .order('created_at', { ascending: true });

                if (duplicateBookings && duplicateBookings.length > 1) {
                    const firstBooking = duplicateBookings[0];
                    if (firstBooking.id !== insertedBooking.id) {
                        console.warn(`雙重預約偵測 (API)！我 (${insertedBooking.id}) 晚了一步。第一筆是 ${firstBooking.id}`);
                        
                        await supabase.from('bookings').delete().eq('id', insertedBooking.id);
                        
                        return res.status(409).json({ 
                            error: 'Conflict', 
                            message: `抱歉！您選擇的時段 [${date} ${time}] 剛剛被搶先預約了 (競爭失敗)。` 
                        });
                    }
                }
            }

            // 2.5 取得用戶暱稱 (For Google Calendar)
            let nickname = '';
            if (userId && userId !== 'U_GUEST' && type !== 'block') {
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
            
            let summaryDisplay = summaryName;
            
            if (summaryNickname && summaryName !== summaryNickname && !summaryName.includes(summaryNickname)) {
                 summaryDisplay = `${summaryName}(${summaryNickname})`;
            }

            // 3. 建立事件物件
            let eventSummary = `【新預約】${summaryDisplay} ${phone || ''} - ${stylist || 'Any Staff'}`;
            let eventDescription = `透過 LINE 預約系統建立 (API)\nBooking ID: ${insertedBooking.id}\nUser ID: ${userId || 'N/A'}\nName: ${name || 'N/A'}\nNickname: ${nickname || 'N/A'}\nStylist: ${stylist || 'Any Staff'}`;
            let colorId = null; // Default color

            // 根據類型調整標題與顏色
            if (type === 'block') {
                eventSummary = `⛔ [保留] ${stylist || '全店'} - ${name || '內部保留'}`;
                eventDescription = `內部保留時段\n備註: ${name || '無'}\nStylist: ${stylist || 'N/A'}\nBooking ID: ${insertedBooking.id}`;
                colorId = '8'; // 灰色 (Graphite) 或其他顏色，視 Google Calendar 設定而定
            } else if (type === 'staff_booking') {
                eventSummary = `📅 [代約] ${summaryDisplay} ${phone || ''} - ${stylist || 'Any Staff'}`;
                colorId = '6'; // 橘色 (Tangerine)
            }

            const event = {
                summary: eventSummary,
                description: eventDescription,
                colorId: colorId
            };

            if (isAllDay) {
                event.start = { date: date }; // YYYY-MM-DD
                // End date for single day all-day event is next day
                const d = new Date(date);
                d.setDate(d.getDate() + 1);
                event.end = { date: d.toISOString().split('T')[0] };
            } else {
                event.start = { dateTime: startDateTime, timeZone: 'Asia/Taipei' };
                event.end = { dateTime: endDateTime, timeZone: 'Asia/Taipei' };
            }

            // 4. 寫入 Google Calendar (含補償機制)
            let insertResponse;
            try {
                insertResponse = await calendar.events.insert({
                    calendarId: process.env.GOOGLE_CALENDAR_ID,
                    resource: event,
                });
            } catch (googleError) {
                console.error('Google Calendar 寫入失敗，執行 DB 回滾:', googleError);
                // CRITICAL: 如果 Google 寫入失敗，必須刪除 DB 紀錄，確保一致性
                await supabase.from('bookings').delete().eq('id', insertedBooking.id);
                throw new Error(`Google Calendar Sync Failed: ${googleError.message}`);
            }

            eventUrl = insertResponse.data.htmlLink;
            console.log('Google Calendar 事件建立成功:', eventUrl);

            // 4.5 更新 DB 紀錄，補上 Google Event 連結 (Optional but recommended for traceability)
            try {
                const updatedMessage = JSON.parse(insertedBooking.message);
                updatedMessage.googleEventLink = eventUrl;
                updatedMessage.googleEventId = insertResponse.data.id;
                
                await supabase
                    .from('bookings')
                    .update({ message: JSON.stringify(updatedMessage) })
                    .eq('id', insertedBooking.id);
            } catch (updateError) {
                console.warn('Failed to update booking with Google Link (Non-fatal):', updateError);
            }

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
                                text: `✅ 預約已確認！\n\n設計師：${stylist || '指定設計師'}\n日期：${date}\n時間：${time}${endTime ? '-' + endTime : ''}\n手機：${phone}\n\n請準時到達，謝謝！`
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
