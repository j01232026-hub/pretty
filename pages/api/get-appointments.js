import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    const { user_id, type = 'upcoming' } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // 取得今天的日期字串 (YYYY-MM-DD)
        // 為了確保時區正確，這裡使用簡單的 ISO 切割，或者固定 +8 時區
        const now = new Date();
        const offset = 8 * 60 * 60 * 1000; // UTC+8
        const today = new Date(now.getTime() + offset).toISOString().split('T')[0];

        // 查詢 Supabase 資料庫
        // 注意：目前專案使用 'bookings' 資料表，且詳細資訊 (date, time) 儲存在 'message' (JSON string) 欄位中
        // 因此無法直接在 SQL 層使用 .gte('date', ...) 進行過濾 (除非修改 Schema)
        // 這裡採用「取出該用戶所有資料 -> JS 解析 -> JS 過濾排序」的策略
        
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('user_id', user_id);

        if (error) throw error;

        // 解析與整理資料
        let appointments = bookings.map(booking => {
            let details = {};
            try {
                // message 欄位是 JSON 字串
                details = JSON.parse(booking.message);
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
                ...details // 展開其他可能欄位
            };
        }).filter(appt => appt.date && appt.time); // 過濾掉無法解析日期的無效資料

        // 根據 type 進行過濾與排序
        if (type === 'upcoming') {
            // 未來預約：日期 >= 今天
            // 排序：日期 ASC, 時間 ASC (越早的越上面)
            appointments = appointments
                .filter(a => a.date >= today)
                .sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.time.localeCompare(b.time);
                });
        } else if (type === 'history') {
            // 歷史紀錄：日期 < 今天
            // 排序：日期 DESC, 時間 DESC (最近的歷史在最上面)
            appointments = appointments
                .filter(a => a.date < today)
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
