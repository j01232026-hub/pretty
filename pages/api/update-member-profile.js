import supabaseAdmin from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { user_id, name, display_name, phone, birthday, email, picture_url, store_id } = req.body;
    const finalName = name || display_name;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
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
            
            // 1. Try to find existing profile by line_id (and store_id if needed, but user_id should be global auth id)
            // Actually, user_id in profiles is the Auth UUID.
            // We need to find the Auth UUID associated with this LINE ID.
            
            // First, check if we already have a profile for this LINE ID
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
                
                // We can't easily search users by metadata efficiently without listUsers loop, 
                // but we can try to create and catch error, or list users by email?
                // listUsers() doesn't support filter by email directly in all versions, but let's try strict check logic from line.js
                // Actually, createUser with existing email returns error? Or we can use listUsers.
                
                // Optimization: Try to create. If fails due to email conflict, find the user.
                // But safer to list first if possible. 
                // Let's assume we need to create if not found.
                
                // Let's try to fetch user by email if possible (not directly exposed in admin api easily in v1, but v2 has listUsers)
                // We'll use the logic: try to create. If error says "already registered", then we search.
                
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: dummyEmail,
                    email_confirm: true,
                    user_metadata: { full_name: finalName, line_id: lineId }
                });
                
                if (createError) {
                    // If user already exists, we need to find their ID.
                    // Since we can't query by email easily in single call, we might have to list.
                    // Or, if we trust the email convention, we can't easily get ID without listing.
                    // Wait, supabaseAdmin.auth.admin.listUsers() is available.
                    
                    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
                    const foundUser = usersData.users.find(u => u.email === dummyEmail);
                    
                    if (foundUser) {
                        targetUserId = foundUser.id;
                    } else {
                        throw new Error('Could not create user and could not find existing user: ' + createError.message);
                    }
                } else {
                    targetUserId = newUser.user.id;
                }
            }
        }

        const updates = {
            user_id: targetUserId,
            display_name: finalName,
            phone,
            birthday,
            email,
            is_complete: true,
            store_id: store_id || null,
            picture_url: picture_url
        };
        
        if (lineId) {
            updates.line_id = lineId;
        }

        // Upsert based on user_id and store_id combination
        // Note: Ensure your database has a UNIQUE constraint on (user_id, store_id)
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .upsert(updates, { onConflict: 'user_id, store_id' })
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
