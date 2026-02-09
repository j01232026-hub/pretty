
import supabase from '../../lib/supabaseClient';
import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { owner_id, store, staff } = req.body;

    if (!owner_id || !store || !store.store_name || !staff || !staff.name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Create Store
        const { data: storeData, error: storeError } = await supabaseAdmin
            .from('stores')
            .insert([{
                owner_id: owner_id,
                store_name: store.store_name,
                address: store.address || '',
                store_phone: store.store_phone || '',
                // image_url can be added if needed, currently not in form
            }])
            .select()
            .single();

        if (storeError) {
            console.error('Create Store Error:', storeError);
            throw new Error('Failed to create store: ' + storeError.message);
        }

        const newStoreId = storeData.id;

        // 2. Create Staff (Stylist)
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('stylists')
            .insert([{
                store_id: newStoreId,
                name: staff.name,
                title: staff.title || '店長',
                phone: staff.phone || '',
                email: staff.email || '',
                avatar_url: staff.avatar_url || '',
                visible: true
            }])
            .select()
            .single();

        if (staffError) {
            console.error('Create Staff Error:', staffError);
            // Rollback store? Ideally yes, but Supabase JS doesn't support transactions easily without RPC.
            // For now, we'll leave the store (user can edit/delete) or try to delete it.
            await supabaseAdmin.from('stores').delete().eq('id', newStoreId);
            throw new Error('Failed to create staff: ' + staffError.message);
        }

        return res.status(200).json({ 
            message: 'Success', 
            store: storeData, 
            staff: staffData 
        });

    } catch (error) {
        console.error('Create Store Staff API Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
