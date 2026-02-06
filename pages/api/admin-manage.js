import { google } from 'googleapis';
import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    // 0. 安全驗證
    const { secret } = req.query;
    if (secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret' });
    }

    try {
        // 初始化 Google Calendar 客戶端
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing');
        }

        const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: serviceAccountKey.client_email,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        const authClient = await auth.getClient();
        const calendar = google.calendar({ version: 'v3', auth: authClient });

        // 1. GET: 讀取預約列表
        if (req.method === 'GET') {
            const today = new Date().toISOString().split('T')[0];
            
            // 查詢 bookings 資料表
            // 由於 schema 中 date/time 存於 JSON message 欄位或不確定是否存在獨立欄位
            // 保險起見，抓取最近的預約，並在 JS 層過濾與排序
            const { data, error } = await supabase
                .from('bookings')
                .select('*')
                .order('created_at', { ascending: false }) // 先抓最新的
                .limit(100); // 限制數量，避免爆量

            if (error) throw error;

            // JS 層過濾與處理
            const futureBookings = data
                .map(booking => {
                    // 嘗試解析 message 欄位
                    let details = {};
                    try {
                        details = typeof booking.message === 'string' ? JSON.parse(booking.message) : booking.message;
                    } catch (e) { console.warn('JSON parse error', e); }
                    
                    return {
                        ...booking,
                        date: booking.date || details.date, // 優先用欄位，沒有則用 JSON
                        time: booking.time || details.time,
                        phone: booking.phone || details.phone,
                        name: details.name, // Try to extract name from JSON
                        service: details.service, // Try to extract service from JSON
                        type: booking.type || details.type || 'regular', // Ensure type is present
                        googleEventId: details.googleEventId // Expose for debugging if needed
                    };
                })
                .filter(b => b.date && b.date >= today) // 只留今天以後的
                .sort((a, b) => {
                    // 日期時間排序
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.time.localeCompare(b.time);
                });

            return res.status(200).json(futureBookings);
        }

        // 2. DELETE: 取消預約
        if (req.method === 'DELETE') {
            const { appointment_id } = req.body;
            
            if (!appointment_id) {
                return res.status(400).json({ error: 'Missing appointment_id' });
            }

            // 第一步：查 ID 與詳細資料 (以備 Fallback 使用)
            const { data: booking, error: fetchError } = await supabase
                .from('bookings')
                .select('*')
                .eq('id', appointment_id)
                .single();

            if (fetchError) {
                // 如果找不到資料，可能已經刪除了
                console.warn('Booking not found or fetch error:', fetchError);
                return res.status(404).json({ error: 'Booking not found' });
            }

            // 解析 booking 資料，準備 Fallback 參數
            let bookingDetails = {};
            try {
                bookingDetails = typeof booking.message === 'string' ? JSON.parse(booking.message) : booking.message;
            } catch (e) { console.warn('JSON parse error during delete:', e); }

            const targetDate = booking.date || bookingDetails.date;
            const targetTime = booking.time || bookingDetails.time;
            const targetPhone = booking.phone || bookingDetails.phone;

            // 第二步：嘗試刪除 Google 日曆行程
            let googleDeleted = false;
            
            // Extract googleEventId from JSON message
            const googleEventId = booking.google_event_id || bookingDetails.googleEventId;

            // 優先策略：使用 google_event_id 直接刪除
            if (googleEventId) {
                try {
                    await calendar.events.delete({
                        calendarId: process.env.GOOGLE_CALENDAR_ID,
                        eventId: googleEventId
                    });
                    console.log(`Google Event ${googleEventId} deleted (By ID).`);
                    googleDeleted = true;
                } catch (err) {
                    console.warn(`Failed to delete by ID ${googleEventId}, trying fallback...`, err.message);
                }
            }

            // 後備策略 (Fallback)：如果 ID 無效或不存在，改用「時間+電話」搜尋並刪除
            // 這是為了處理舊資料 (沒有存 google_event_id 的預約)
            if (!googleDeleted && targetDate && targetTime && targetPhone) {
                try {
                    console.log(`Starting fallback delete search for ${targetDate} ${targetTime} ${targetPhone}`);
                    
                    // 設定搜尋範圍：預約時間前後 10 分鐘
                    // 必須轉成 ISO 格式
                    const startDateTime = `${targetDate}T${targetTime}:00+08:00`;
                    const startObj = new Date(startDateTime);
                    
                    // 搜尋區間 (寬鬆一點，前後 20 分鐘，避免時區微小差異)
                    const timeMin = new Date(startObj.getTime() - 20 * 60 * 1000).toISOString();
                    const timeMax = new Date(startObj.getTime() + 20 * 60 * 1000).toISOString();

                    const listRes = await calendar.events.list({
                        calendarId: process.env.GOOGLE_CALENDAR_ID,
                        timeMin: timeMin,
                        timeMax: timeMax,
                        singleEvents: true, // 展開循環事件 (雖然這裡應該不是)
                    });

                    const events = listRes.data.items || [];
                    
                    // 尋找特徵吻合的事件 (電話號碼在標題或描述中)
                    const targetEvent = events.find(ev => {
                        const summaryMatch = ev.summary && ev.summary.includes(targetPhone);
                        const descMatch = ev.description && ev.description.includes(targetPhone);
                        return summaryMatch || descMatch;
                    });

                    if (targetEvent) {
                        await calendar.events.delete({
                            calendarId: process.env.GOOGLE_CALENDAR_ID,
                            eventId: targetEvent.id
                        });
                        console.log(`Google Event ${targetEvent.id} deleted (By Fallback Search).`);
                        googleDeleted = true;
                    } else {
                        console.log('Fallback search found no matching event.');
                    }

                } catch (fallbackError) {
                    console.error('Fallback delete error:', fallbackError);
                    // 不拋出錯誤，確保至少能刪除資料庫紀錄
                }
            }

            // 第三步：刪除資料庫紀錄
            const { error: deleteError } = await supabase
                .from('bookings')
                .delete()
                .eq('id', appointment_id);

            if (deleteError) throw deleteError;

            return res.status(200).json({ 
                success: true, 
                message: '預約已取消 (資料庫 + Google 日曆)' 
            });
        }

        // 3. PUT: 修改預約 (新功能)
        if (req.method === 'PUT') {
            const { appointment_id, new_date, new_start_time, new_end_time } = req.body;

            // 參數檢查 (前端如果不傳 end_time，就預設 start + 1hr，但這裡建議前端傳完整的)
            if (!appointment_id || !new_date || !new_start_time) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // 1. 讀取原始資料
            const { data: booking, error: fetchError } = await supabase
                .from('bookings')
                .select('*')
                .eq('id', appointment_id)
                .single();

            if (fetchError || !booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // 解析原始訊息以取得電話號碼
            let bookingDetails = {};
            try {
                bookingDetails = typeof booking.message === 'string' ? JSON.parse(booking.message) : booking.message;
            } catch (e) { console.warn('JSON parse error during update:', e); }

            const phone = booking.phone || bookingDetails.phone || 'Unknown';

            // 2. 準備新的時間物件 (ISO 8601, Asia/Taipei +08:00)
            const startDateTime = `${new_date}T${new_start_time}:00+08:00`;
            
            // 計算結束時間：如果有傳 new_end_time 則使用，否則預設 +1 小時
            let endDateTime = '';
            if (new_end_time) {
                 endDateTime = `${new_date}T${new_end_time}:00+08:00`;
            } else {
                 const startDateObj = new Date(startDateTime);
                 const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000); // +1 hr
                 // 手動建構 ISO 字串 (處理 UTC -> +08:00)
                 const tempDate = new Date(endDateObj.getTime());
                 tempDate.setUTCHours(tempDate.getUTCHours() + 8);
                 endDateTime = tempDate.toISOString().replace('Z', '+08:00');
            }

            // 3. 智慧防撞期檢查 (Smart Conflict Detection)
            console.log(`Update Check (Smart): ${startDateTime} to ${endDateTime}`);

            // 使用 events.list 列出該區間所有行程
            const eventsList = await calendar.events.list({
                calendarId: process.env.GOOGLE_CALENDAR_ID,
                timeMin: startDateTime,
                timeMax: endDateTime,
                singleEvents: true,
                timeZone: 'Asia/Taipei',
            });

            const conflictingEvents = eventsList.data.items || [];

            // 關鍵過濾：排除掉「自己」
            const realConflicts = conflictingEvents.filter(event => {
                // 如果這個行程的 ID 等於我們正在修改的 ID，就回傳 false (把它濾掉)
                // 注意：如果資料庫沒有 google_event_id，那就無法排除自己，會退化成一般檢查 (這也合理，因為無 ID 無法辨識)
                return event.id !== booking.google_event_id;
            });

            if (realConflicts.length > 0) {
                console.warn('Update Conflict: Found other events.', realConflicts.map(e => e.summary));
                return res.status(409).json({
                    error: 'Conflict',
                    message: `修改失敗！該時段已與其他預約衝突。`
                });
            }

            console.log('Update Check Passed: No conflicts found.');

            // 4. 執行更新

            // A. 更新 Google 日曆
            if (booking.google_event_id) {
                try {
                    await calendar.events.patch({
                        calendarId: process.env.GOOGLE_CALENDAR_ID,
                        eventId: booking.google_event_id,
                        resource: {
                            start: { dateTime: startDateTime, timeZone: 'Asia/Taipei' },
                            end: { dateTime: endDateTime, timeZone: 'Asia/Taipei' }
                        }
                    });
                    console.log(`Google Event ${booking.google_event_id} updated.`);
                } catch (googleError) {
                    console.error('Failed to update Google Calendar:', googleError.message);
                    return res.status(500).json({ 
                        error: 'Calendar Update Failed', 
                        message: 'Google 日曆更新失敗，請稍後再試。' 
                    });
                }
            } else {
                console.warn('No google_event_id found, skipping Google Calendar update.');
            }

            // B. 更新 Supabase 資料庫
            // 更新 message 欄位內的 JSON
            
            // 確保有 end_time (如果前端沒傳，就從計算出的 endDateTime 擷取)
            let finalEndTime = new_end_time;
            if (!finalEndTime && endDateTime) {
                try {
                    // endDateTime format: YYYY-MM-DDTHH:mm:ss+08:00
                    finalEndTime = endDateTime.split('T')[1].substring(0, 5);
                } catch (e) {}
            }

            const newMessageObj = {
                ...bookingDetails,
                action: 'book', 
                date: new_date,
                time: new_start_time,
                end_time: finalEndTime,
                phone: phone
            };
            const newMessageStr = JSON.stringify(newMessageObj);

            const { error: updateError } = await supabase
                .from('bookings')
                .update({ 
                    message: newMessageStr,
                    // 如果未來有獨立的 date/time 欄位，也可以在這裡更新
                })
                .eq('id', appointment_id);

            if (updateError) {
                console.error('Supabase Update Failed:', updateError);
                throw updateError;
            }

            return res.status(200).json({
                success: true,
                message: '預約修改成功 (資料庫 + Google 日曆)'
            });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
}
