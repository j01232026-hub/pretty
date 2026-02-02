
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

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

        // 1. 寫入 Supabase
        const messageStr = `{"action": "book", "date": "${date}", "time": "${time}", "phone": "${phone}"}`;
        
        const { error } = await supabase
            .from('bookings')
            .insert([
                {
                    user_id: userId,
                    message: messageStr,
                    created_at: new Date().toISOString(),
                    // raw_event: null // 這是直接 API 呼叫，沒有原始 LINE 事件
                },
            ]);

        if (error) {
            console.error('Supabase 寫入錯誤:', error);
            // 讓前端知道具體的錯誤訊息，方便除錯
            return res.status(500).json({ error: 'Database error', details: error.message });
        }

        // 2. 嘗試發送 Push Message 通知使用者 (替代 Reply Message)
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
                                text: `✅ 預約已確認！\n日期: ${date}\n時間: ${time}`,
                            },
                        ],
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );
            } catch (pushError) {
                console.error('Push Message 發送失敗 (可能是額度不足或使用者封鎖):', pushError.response?.data || pushError.message);
                // 推播失敗不影響預約成功的結果
            }
        }

        return res.status(200).json({ success: true, message: 'Booking saved' });

    } catch (error) {
        console.error('Submit API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
