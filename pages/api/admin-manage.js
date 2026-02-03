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
                        phone: booking.phone || details.phone
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

            // 優先策略：使用 google_event_id 直接刪除
            if (booking?.google_event_id) {
                try {
                    await calendar.events.delete({
                        calendarId: process.env.GOOGLE_CALENDAR_ID,
                        eventId: booking.google_event_id
                    });
                    console.log(`Google Event ${booking.google_event_id} deleted (By ID).`);
                    googleDeleted = true;
                } catch (err) {
                    console.warn(`Failed to delete by ID ${booking.google_event_id}, trying fallback...`, err.message);
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

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
}
