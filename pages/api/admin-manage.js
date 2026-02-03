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

            // 第一步：查 ID，取得 google_event_id
            const { data: booking, error: fetchError } = await supabase
                .from('bookings')
                .select('google_event_id')
                .eq('id', appointment_id)
                .single();

            if (fetchError) {
                // 如果找不到資料，可能已經刪除了
                console.warn('Booking not found or fetch error:', fetchError);
                return res.status(404).json({ error: 'Booking not found' });
            }

            // 第二步：刪 Google 日曆行程
            if (booking?.google_event_id) {
                try {
                    await calendar.events.delete({
                        calendarId: process.env.GOOGLE_CALENDAR_ID,
                        eventId: booking.google_event_id
                    });
                    console.log(`Google Event ${booking.google_event_id} deleted.`);
                } catch (googleError) {
                    console.error('Failed to delete Google Event:', googleError.message);
                    // 即使 Google 刪除失敗 (例如已不存在)，我們通常還是繼續刪除資料庫
                    // 除非是權限錯誤等嚴重問題。這裡選擇繼續執行。
                }
            } else {
                console.log('No google_event_id found for this booking.');
            }

            // 第三步：刪資料庫
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
