import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    try {
        const { store_id, owner_id } = req.query;
        let query = supabase.from('stores').select('*');

        if (store_id) {
            query = query.eq('id', store_id);
        } else if (owner_id) {
            query = query.eq('owner_id', owner_id);
        } else {
            // Default to the first store or specific default if no params
            // This is for backward compatibility or main landing page
            query = query.limit(1);
        }

        const { data, error } = await query.maybeSingle();

        if (error) throw error;

        // If no store found in DB, return default mockup but log warning
        if (!data) {
             console.warn('No store found, returning default mockup.');
             return res.status(200).json({
                name: 'Pretty Salon (Default)',
                address: '台北市信義區時尚大道123號',
                image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJMRVTW3ayRoqi5ZrDNrEovFo4AVMQISSN6ZuWwe6xw6hmS5YEIONmzOH1ncr7i7dDh_iof0v5X5WRcjuAN0tMFCavA2vcoYmndBrj6yLTM3jsKYa55-tO8FZPZixCPREULF2nKLCRRCzUHnXkWI9ryQ2srqn7bKRW0JZiX3UGRbJv1cMuBZ9te1hbe5pV8WZrfHsTiYNWgXiuomEkBZFztSsYWc3t7v2mtaez-GPYMsaGB1Rhq8nvJQuNYlDcPyaiNnEmySerDk-d'
             });
        }

        // Return store data mapped to salonInfo structure if needed, or direct
        // Assuming stores table has: store_name, address, store_phone, etc.
        const salonInfo = {
            name: data.store_name || 'Pretty Salon',
            address: data.address || '台北市信義區時尚大道123號',
            phone: data.store_phone || '',
            image_url: data.image_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJMRVTW3ayRoqi5ZrDNrEovFo4AVMQISSN6ZuWwe6xw6hmS5YEIONmzOH1ncr7i7dDh_iof0v5X5WRcjuAN0tMFCavA2vcoYmndBrj6yLTM3jsKYa55-tO8FZPZixCPREULF2nKLCRRCzUHnXkWI9ryQ2srqn7bKRW0JZiX3UGRbJv1cMuBZ9te1hbe5pV8WZrfHsTiYNWgXiuomEkBZFztSsYWc3t7v2mtaez-GPYMsaGB1Rhq8nvJQuNYlDcPyaiNnEmySerDk-d',
            ...data
        };

        return res.status(200).json(salonInfo);
    } catch (error) {
        console.error('Get Salon Info Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
