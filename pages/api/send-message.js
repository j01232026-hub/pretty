import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    // 1. 只接受 POST 方法
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { content, sender_id, receiver_id } = req.body;

    // 2. 基本參數檢查
    if (!content || !sender_id || !receiver_id) {
        return res.status(400).json({ error: 'Missing required fields: content, sender_id, receiver_id' });
    }

    // 3. 安全檢查 (簡化版)
    if (sender_id === 'ADMIN') {
        // 如果是管理者發送，必須驗證 Secret
        const adminSecret = req.headers['x-admin-secret'];
        if (adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
        }
    } else {
        // 如果是客人 (sender_id != 'ADMIN')
        // TODO: 正式環境應在此驗證 LINE Login ID Token，確保 sender_id 確實是當前登入用戶
        // 目前開發階段暫時跳過
    }

    try {
        // 4. 寫入 Supabase 資料庫
        const { data, error } = await supabase
            .from('messages')
            .insert([
                {
                    content,
                    sender_id,
                    receiver_id,
                    // created_at 會由資料庫預設值自動產生
                }
            ])
            .select();

        if (error) throw error;

        // 5. 回傳成功
        return res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('Send Message Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
}
