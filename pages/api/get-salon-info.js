import supabase from '../../lib/supabaseClient';

export default async function handler(req, res) {
    try {
        const { data, error } = await supabase
            .from('salon_info')
            .select('*')
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        // Set default values if no data found
        const salonInfo = data || {
            name: 'Pretty Salon',
            address: '台北市信義區時尚大道123號',
            image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJMRVTW3ayRoqi5ZrDNrEovFo4AVMQISSN6ZuWwe6xw6hmS5YEIONmzOH1ncr7i7dDh_iof0v5X5WRcjuAN0tMFCavA2vcoYmndBrj6yLTM3jsKYa55-tO8FZPZixCPREULF2nKLCRRCzUHnXkWI9ryQ2srqn7bKRW0JZiX3UGRbJv1cMuBZ9te1hbe5pV8WZrfHsTiYNWgXiuomEkBZFztSsYWc3t7v2mtaez-GPYMsaGB1Rhq8nvJQuNYlDcPyaiNnEmySerDk-d'
        };

        return res.status(200).json(salonInfo);
    } catch (error) {
        console.error('Get Salon Info Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
