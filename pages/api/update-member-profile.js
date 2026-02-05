import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { user_id, name, display_name, phone, birthday, email, picture_url } = req.body;
    const finalName = name || display_name;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    // Validation (optional, can be enhanced)
    if (!phone || !birthday) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Fetch existing profile to check for join_date
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('join_date')
            .eq('user_id', user_id)
            .single();

        const updates = {
            user_id,
            display_name: finalName,
            phone,
            birthday,
            email,
            is_complete: true
        };

        if (!existingProfile || !existingProfile.join_date) {
            updates.join_date = new Date().toISOString();
        }

        if (picture_url) {
            updates.picture_url = picture_url;
        }

        const { data, error } = await supabase
            .from('profiles')
            .upsert(updates)
            .select()
            .single();

        if (error) {
            console.error('Error updating profile:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ success: true, profile: data });
    } catch (err) {
        console.error('Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
