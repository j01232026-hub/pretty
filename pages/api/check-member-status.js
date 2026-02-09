import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    const { user_id, store_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // Check if user_id is a valid UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);

        let query = supabaseAdmin
            .from('profiles')
            .select('*');

        if (isUuid) {
            query = query.eq('user_id', user_id);
        } else {
            // Assume it's a LINE ID
            query = query.eq('line_id', user_id);
        }

        if (store_id) {
            query = query.eq('store_id', store_id);
        }

        // Use maybeSingle() to avoid error if no row found (returns null data)
        const { data, error } = await query.maybeSingle();

        if (error) {
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
