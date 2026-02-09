
import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    // Enable CORS if needed (though same-origin usually doesn't need it)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Health check endpoint
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok', message: 'Store Setup API is ready' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { owner_id, store, staff } = req.body;

    if (!owner_id || !store || !store.store_name || !staff || !staff.name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        console.log('Starting store creation for owner:', owner_id);

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
        console.log('Store created:', newStoreId);

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
            // Attempt rollback
            await supabaseAdmin.from('stores').delete().eq('id', newStoreId);
            throw new Error('Failed to create staff: ' + staffError.message);
        }

        return res.status(200).json({ 
            message: 'Success', 
            store: storeData, 
            staff: staffData 
        });

    } catch (error) {
        console.error('Setup Store API Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
