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
        path.includes('auth-register.html')) {
        return;
    }

    // If store_id is present, we assume context is correct
    if (storeId) return;

    console.log('Gateway: Store ID missing, checking user stores...');

    // Check Session
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        // Let the page's own auth logic handle redirect, or do it here
        // Usually admin pages redirect to login if no session
        // We'll leave it to the page's main script to handle "not logged in"
        // to avoid double redirects.
        return;
    }

    const user = session.user;

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
            alert('您尚未建立任何店家，請聯繫管理員。');
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