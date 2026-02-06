import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // 1. 安全驗證
    const { secret, q } = req.query;
    
    // 簡單的密鑰驗證
    if (secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret' });
    }

    if (!q || q.trim().length === 0) {
        return res.status(200).json([]);
    }

    try {
        const keyword = `%${q.trim()}%`;
        
        // 2. 搜尋 profiles 表
        // 支援透過 display_name (Line 暱稱), custom_name (自定義姓名), phone (電話) 查詢
        const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, custom_name, phone, picture_url')
            .or(`display_name.ilike.${keyword},custom_name.ilike.${keyword},phone.ilike.${keyword}`)
            .limit(20); // 限制回傳數量，避免過多資料

        if (error) throw error;

        // 3. 格式化回傳資料
        const results = data.map(profile => ({
            userId: profile.user_id,
            name: profile.custom_name || profile.display_name || '未命名',
            originalName: profile.display_name, // 保留原始暱稱供參考
            phone: profile.phone || '',
            avatar: profile.picture_url || ''
        }));

        return res.status(200).json(results);
    } catch (error) {
        console.error('Search Members API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
