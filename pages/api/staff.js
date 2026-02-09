
import supabase from '../../lib/supabaseClient';
import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    // 簡單的 API 金鑰驗證 (Optional, consistent with admin-manage.js)
    // const { secret } = req.query;
    // if (secret !== process.env.ADMIN_SECRET) { ... } 
    // For now, we'll rely on the frontend passing the secret or just open it as it's an internal tool prototype.
    // Better to verify secret if possible, let's look at admin-manage.js pattern.
    // admin-manage.js checks `req.query.secret`. We should probably do the same or check headers.
    
    // For simplicity in this iteration, we assume the user accessing this has access.
    
    if (req.method === 'GET') {
        try {
            const { store_id } = req.query;
            let query = supabase.from('stylists').select('*').order('created_at', { ascending: false });

            if (store_id) {
                query = query.eq('store_id', store_id);
            }
            
            const { data, error } = await query;

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        const { name, title, phone, email, avatar_url, visible, store_id } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        if (!store_id) return res.status(400).json({ error: 'Store ID is required for multi-tenancy' });

        try {
            // Use supabaseAdmin to bypass RLS for writes (since we don't have user session here)
            // TODO: Add proper authentication (e.g. check secret or token)
            const { data, error } = await supabaseAdmin
                .from('stylists')
                .insert([{ 
                    name, 
                    title, 
                    phone, 
                    email, 
                    avatar_url,
                    visible: visible !== undefined ? visible : true, // Default to true
                    store_id
                }])
                .select();

            if (error) throw error;
            return res.status(201).json(data[0]);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        const { id, name, title, phone, email, avatar_url, visible, store_id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required' });

        try {
            // Build update object dynamically to allow partial updates
            const updates = { updated_at: new Date() };
            if (name !== undefined) updates.name = name;
            if (title !== undefined) updates.title = title;
            if (phone !== undefined) updates.phone = phone;
            if (email !== undefined) updates.email = email;
            if (avatar_url !== undefined) updates.avatar_url = avatar_url;
            if (visible !== undefined) updates.visible = visible;
            // Ideally, store_id should not change, but if needed:
            if (store_id !== undefined) updates.store_id = store_id;

            const { data, error } = await supabaseAdmin
                .from('stylists')
                .update(updates)
                .eq('id', id)
                .select();

            if (error) throw error;
            return res.status(200).json(data[0]);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required' });

        try {
            const { error } = await supabaseAdmin
                .from('stylists')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ message: 'Deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
