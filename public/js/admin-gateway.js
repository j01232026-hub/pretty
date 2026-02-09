(async function() {
    // 1. Wait for Supabase Library (CDN)
    const waitForSupabaseLib = () => {
        return new Promise(resolve => {
            if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
            const interval = setInterval(() => {
                if (window.supabase && window.supabase.createClient) {
                    clearInterval(interval);
                    resolve(window.supabase);
                }
            }, 100);
        });
    };

    const SupabaseLib = await waitForSupabaseLib();

    // 2. Fetch Config
    let config;
    try {
        const res = await fetch('/api/config');
        config = await res.json();
    } catch (e) {
        console.error('Gateway: Failed to load config');
        return;
    }

    if (!config.supabaseUrl || !config.supabaseKey) {
        console.error('Gateway: Missing Supabase config');
        return;
    }

    // 3. Create Client
    const sb = SupabaseLib.createClient(config.supabaseUrl, config.supabaseKey);

    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('store_id');
    const path = window.location.pathname;

    // Ignore if already on specific pages
    if (path.includes('admin-store-select.html') || 
        path.includes('auth-login.html') || 
        path.includes('auth-register.html') ||
        path.includes('auth-profile.html') ||
        path.includes('auth-store.html')) {
        return;
    }

    // If store_id is present, we assume context is correct
    if (storeId) return;

    console.log('Gateway: Store ID missing, checking user stores...');

    // Check Session
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        console.warn('Gateway: No session, redirecting to login...');
        window.location.href = '/auth-login.html';
        return;
    }

    const user = session.user;

    // 2. Check Profile Status (Is Profile Complete?)
    // Instead of fetching "the" profile, we check if ANY complete profile exists for this user.
    // This avoids issues where a duplicate incomplete profile (phantom row) blocks access.
    const { data: profiles, error: profileError } = await sb
        .from('profiles')
        .select('id, is_complete')
        .eq('user_id', user.id)
        .eq('is_complete', true)
        .limit(1);

    if (profileError) {
        console.error('Gateway Error:', profileError);
        // On error, we shouldn't block, but maybe warn? 
        // Or assume incomplete if error? Let's assume incomplete to be safe but log it.
    }

    const hasCompleteProfile = profiles && profiles.length > 0;

    if (!hasCompleteProfile) {
        console.warn('Gateway: No complete profile found, redirecting to profile setup...');
        // Check if we are already on the profile page to avoid infinite reload loop
        if (!window.location.pathname.includes('auth-profile.html')) {
             window.location.href = '/auth-profile.html';
        }
        return;
    }

    // 3. Check Store Status (Does user have a store?)
    try {
        const { data: stores, error } = await sb
            .from('stores')
            .select('id, store_name')
            .eq('owner_id', user.id);

        if (error) {
            console.error('Gateway: Failed to fetch stores', error);
            return;
        }

        if (!stores || stores.length === 0) {
            console.warn('Gateway: No stores found for this user.');
            // Redirect to store creation immediately
            window.location.href = '/auth-store.html';
        } else if (stores.length === 1) {
            // Single store: Auto-redirect
            console.log('Gateway: Single store found, redirecting...');
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('store_id', stores[0].id);
            window.location.replace(newUrl.toString());
        } else {
            // Multiple stores: Redirect to selection page
            console.log('Gateway: Multiple stores found, redirecting to selector...');
            // Redirect to selection page
            window.location.href = `/admin-store-select.html?redirect=${encodeURIComponent(path)}`;
        }

    } catch (err) {
        console.error('Gateway: System error', err);
    }

})();