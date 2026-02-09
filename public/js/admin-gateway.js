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

    // Check Profile (Registration Status)
    try {
        const { data: profile, error: profileError } = await sb
            .from('profiles')
            .select('id, is_complete')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.warn('Gateway: No profile found, redirecting to profile setup...');
            window.location.href = '/auth-profile.html';
            return;
        }

        if (!profile.is_complete) {
            console.warn('Gateway: Profile incomplete, redirecting to profile setup...');
            window.location.href = '/auth-profile.html';
            return;
        }
    } catch (e) {
        console.error('Gateway: Profile check error', e);
        // Continue to store check or return? Safe to return to avoid inconsistent state
        return; 
    }

    // Fetch Stores
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