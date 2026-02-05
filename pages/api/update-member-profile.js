import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { user_id, name, display_name, phone, birthday, email } = req.body;
    const finalName = name || display_name;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    // Validation (optional, can be enhanced)
    if (!phone || !birthday) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const updates = {
            user_id,
            display_name: finalName,
            phone,
            birthday,
            email,
            is_complete: true,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('profiles')
            .upsert(updates)
            .select();

        if (error) {
            console.error('Error updating profile:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
