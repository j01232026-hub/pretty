import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    const { user_id, type = 'upcoming', store_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    // Disable caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        // 取得今天的日期字串 (YYYY-MM-DD)
        // 為了確保時區正確，這裡使用簡單的 ISO 切割，或者固定 +8 時區
        const now = new Date();
        const offset = 8 * 60 * 60 * 1000; // UTC+8
        const today = new Date(now.getTime() + offset).toISOString().split('T')[0];

        // 查詢 Supabase 資料庫
        // 使用 supabaseAdmin 繞過 RLS，確保能讀取到 bookings 與關聯的 stores 資料
        
        let query = supabaseAdmin
            .from('bookings')
            .select('*, stores(store_name, address, store_phone)')
            .eq('user_id', user_id);

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        const { data: bookings, error } = await query;

        if (error) throw error;

        // 解析與整理資料
        let appointments = bookings.map(booking => {
            let details = {};
            try {
                // message 欄位是 JSON 字串
                details = typeof booking.message === 'string' ? JSON.parse(booking.message) : booking.message;
            } catch (e) {
                console.warn('JSON parse error:', e);
            }

            return {
                id: booking.id,
                created_at: booking.created_at,
                // 優先從 message JSON 中取得日期與時間
                date: details.date || booking.date, 
                time: details.time || booking.time,
                endTime: details.endTime,
                phone: details.phone,
                stylist: details.stylist || '指定設計師',
                store_name: booking.stores?.store_name, // Include store info
                store_address: booking.stores?.address,
                store_phone: booking.stores?.store_phone,
                ...details // 展開其他可能欄位
            };
        }).filter(appt => appt.date && appt.time); // 過濾掉無法解析日期的無效資料

        // 根據 type 進行過濾與排序
        // 取得現在時間 HH:MM (UTC+8)
        const currentHours = new Date(now.getTime() + offset).getUTCHours();
        const currentMinutes = new Date(now.getTime() + offset).getUTCMinutes();
        const currentTimeVal = currentHours * 60 + currentMinutes;

        if (type === 'upcoming') {
            // 未來預約：日期 > 今天 OR (日期 == 今天 AND 結束時間 > 現在)
            appointments = appointments
                .filter(a => {
                    if (a.date > today) return true;
                    if (a.date === today) {
                        // 如果沒有 endTime，預設為 time + 60分鐘
                        let endH, endM;
                        if (a.endTime) {
                            [endH, endM] = a.endTime.split(':').map(Number);
                        } else {
                            const [startH, startM] = a.time.split(':').map(Number);
                            endH = startH + 1;
                            endM = startM;
                        }
                        const endTimeVal = endH * 60 + endM;
                        return endTimeVal > currentTimeVal;
                    }
                    return false;
                })
                .sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.time.localeCompare(b.time);
                });
        } else if (type === 'history') {
            // 歷史紀錄：日期 < 今天 OR (日期 == 今天 AND 結束時間 <= 現在)
            appointments = appointments
                .filter(a => {
                    if (a.date < today) return true;
                    if (a.date === today) {
                        let endH, endM;
                        if (a.endTime) {
                            [endH, endM] = a.endTime.split(':').map(Number);
                        } else {
                            const [startH, startM] = a.time.split(':').map(Number);
                            endH = startH + 1;
                            endM = startM;
                        }
                        const endTimeVal = endH * 60 + endM;
                        return endTimeVal <= currentTimeVal;
                    }
                    return false;
                })
                .sort((a, b) => {
                    if (a.date !== b.date) return b.date.localeCompare(a.date);
                    return b.time.localeCompare(a.time);
                });
        }

        // 回傳結果
        return res.status(200).json(appointments);

    } catch (error) {
        console.error('Get Appointments Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
}
