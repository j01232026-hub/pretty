import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // 查詢所有與該 user_id 有關的訊息
        // 條件：(sender_id = user_id) OR (receiver_id = user_id)
        // 排序：created_at ASC (舊的在上面，符合對話習慣)
        
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return res.status(200).json(data);

    } catch (error) {
        console.error('Get Messages Error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
}
