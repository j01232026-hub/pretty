import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user_id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error('Error fetching profile:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (data && data.is_complete) {
            return res.status(200).json({ is_complete: true, profile: data });
        } else {
            return res.status(200).json({ is_complete: false, profile: data || {} });
        }
    } catch (err) {
        console.error('Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
