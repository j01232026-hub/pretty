import supabaseAdmin from '../../lib/supabaseAdmin';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { user_id, name, display_name, phone, birthday, email, picture_url, store_id } = req.body;
    const finalName = name || display_name;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    
    // Ensure store_id is provided for multi-tenancy
    if (!store_id) {
        return res.status(400).json({ error: 'Missing store_id' });
    }

    // Validation (optional, can be enhanced)
    if (!phone || !birthday) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let targetUserId = user_id;
        let lineId = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);

        if (!isUuid) {
            // It's likely a LINE ID
            lineId = user_id;
            
            // 1. Try to find existing profile by line_id
            // We search globally first because user_id (Auth ID) is the same across stores
            const { data: existingProfile } = await supabaseAdmin
                .from('profiles')
                .select('user_id')
                .eq('line_id', lineId)
                .limit(1)
                .maybeSingle();
                
            if (existingProfile) {
                targetUserId = existingProfile.user_id;
            } else {
                // 2. If no profile, check if Auth user exists (by email convention)
                const dummyEmail = `line_${lineId}@pretty.app`;
                
                // Check if user exists by email
                const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
                const foundUser = usersData.users.find(u => u.email === dummyEmail);
                
                if (foundUser) {
                    targetUserId = foundUser.id;
                } else {
                    // Create new user
                    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                        email: dummyEmail,
                        email_confirm: true,
                        user_metadata: { full_name: finalName, line_id: lineId }
                    });
                    
                    if (createError) {
                        console.error('Create user error:', createError);
                        throw new Error('Could not create user: ' + createError.message);
                    }
                    targetUserId = newUser.user.id;
                }
            }
        }

        // Prepare updates
        const updates = {
            user_id: targetUserId,
            display_name: finalName,
            phone,
            birthday,
            email,
            is_complete: true,
            store_id: store_id,
            picture_url: picture_url,
            updated_at: new Date()
        };
        
        if (lineId) {
            updates.line_id = lineId;
        }

        // Check if profile exists for this store
        const { data: currentProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('user_id', targetUserId)
            .eq('store_id', store_id)
            .maybeSingle();

        let resultData;
        let resultError;

        if (currentProfile) {
            // Update existing
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update(updates)
                .eq('id', currentProfile.id)
                .select()
                .single();
            resultData = data;
            resultError = error;
        } else {
            // Insert new (Explicitly generate ID to avoid NOT NULL constraint issues if DB default is missing)
            updates.id = crypto.randomUUID();
            updates.created_at = new Date();
            
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .insert(updates)
                .select()
                .single();
            resultData = data;
            resultError = error;
        }

        if (resultError) {
            console.error('Error updating/inserting profile:', resultError);
            return res.status(500).json({ error: resultError.message });
        }

        return res.status(200).json({ success: true, profile: resultData });
    } catch (err) {
        console.error('Exception in update-member-profile:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}
