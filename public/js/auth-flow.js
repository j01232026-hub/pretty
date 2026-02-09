
const AuthFlow = {
    supabase: null,
    user: null,
    profile: null,

    init: async () => {
        try {
            // 1. Fetch Config
            const res = await fetch('/api/config');
            const config = await res.json();
            
            if (!config.supabaseUrl || !config.supabaseKey) {
                console.error('Supabase config missing');
                return;
            }

            // 2. Initialize Supabase
            if (typeof supabase !== 'undefined') {
                AuthFlow.supabase = supabase.createClient(config.supabaseUrl, config.supabaseKey);
            } else {
                console.error('Supabase SDK not loaded');
                return;
            }

            // 3. Check Initial Session
            const { data: { session } } = await AuthFlow.supabase.auth.getSession();
            AuthFlow.user = session?.user || null;

            // 4. Setup Auth Listener
            AuthFlow.supabase.auth.onAuthStateChange((event, session) => {
                AuthFlow.user = session?.user || null;
                AuthFlow.handleRouting();
            });

            // 5. Run Routing Logic
            await AuthFlow.handleRouting();

            // 6. Bind Events (if elements exist)
            AuthFlow.bindEvents();
            
            // 7. Handle Back/Forward Browser Buttons
            window.addEventListener('popstate', async () => {
                // When popping state, we might need to reload content if we want full SPA, 
                // but usually the browser restores the document state. 
                // However, since we swapped body content, browser might not restore the previous body state correctly if we didn't save it.
                // Simpler approach for now: Reload page on popstate to ensure correct state, OR re-fetch.
                // Let's try to handle it gracefully:
                await AuthFlow.navigateTo(window.location.pathname, false); 
            });

        } catch (e) {
            console.error('Auth Init Error:', e);
        }
    },

    navigateTo: async (url, pushState = true) => {
        try {
            // Fetch the target page
            const response = await fetch(url);
            if (!response.ok) throw new Error('Page not found');
            const text = await response.text();
            
            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            
            // Update Title
            document.title = doc.title;
            
            // Update Body Class (important for layout differences)
            document.body.className = doc.body.className;
            
            // Extract Body Content (remove scripts to prevent duplication/issues)
            const newBody = doc.body;
            newBody.querySelectorAll('script').forEach(s => s.remove());
            
            // Replace Content
            document.body.innerHTML = newBody.innerHTML;
            
            // Update URL
            if (pushState) {
                window.history.pushState({}, '', url);
            }
            
            // Re-bind events for the new content
            AuthFlow.bindEvents();
            
            // Run specific page logic
            const page = url.split('/').pop();
            if (page === 'auth-profile.html') {
                AuthFlow.autoFillProfile();
            }
            
        } catch (e) {
            console.error('SPA Navigation Error:', e);
            window.location.href = url; // Fallback to MPA
        }
    },

    handleRouting: async () => {
        const path = window.location.pathname;
        const page = path.split('/').pop();
        
        // --- 0. Admin Page Protection ---
        // If user tries to access ANY admin page or other internal pages
        const isProtectedPage = page.startsWith('admin') || 
                                page.startsWith('booking') || 
                                page.startsWith('appointment') ||
                                page.startsWith('history') ||
                                page.startsWith('member') ||
                                page === 'index.html' || 
                                page === '';

        // If on a protected page, strict checks apply.
        // If on auth pages, we guide them forward.

        // --- 1. Not Logged In ---
        if (!AuthFlow.user) {
            // Allow access only to login/register
            if (page !== 'auth-login.html' && page !== 'auth-register.html') {
                // If on protected page, force login
                if (isProtectedPage || page.startsWith('auth-')) {
                     // Store intended URL if needed (omitted for simplicity)
                     AuthFlow.navigateTo('auth-login.html');
                }
            }
            return;
        }

        // --- 2. Logged In: Check Profile ---
        // Fetch profile if not cached
        if (!AuthFlow.profile) {
            const { data, error } = await AuthFlow.supabase
                .from('profiles')
                .select('*')
                .eq('id', AuthFlow.user.id)
                .single();
            
            // If error is "Row not found", data is null.
            AuthFlow.profile = data;
        }

        // Case A: No Profile -> Go to Profile Setup
        if (!AuthFlow.profile) {
            // Block access to everything except profile setup
            if (page !== 'auth-profile.html') {
                AuthFlow.navigateTo('auth-profile.html');
            } else {
                // We are on profile page, try to auto-fill LINE data
                AuthFlow.autoFillProfile();
            }
            return;
        }

        // Case B: Profile Exists but Not Onboarded (Check Store)
        if (!AuthFlow.profile.is_onboarded) {
            // Check if store exists (Double check to be sure)
            const { data: store } = await AuthFlow.supabase
                .from('stores')
                .select('id')
                .eq('owner_id', AuthFlow.profile.id)
                .single();

            if (!store) {
                // No store -> Go to Store Setup
                // Block access to everything except store setup
                if (page !== 'auth-store.html') {
                    AuthFlow.navigateTo('auth-store.html');
                }
                return;
            } else {
                // Has store but is_onboarded is false? 
                // Maybe they finished store creation but flag wasn't set?
                // Let's force update flag and redirect.
                await AuthFlow.supabase
                    .from('profiles')
                    .update({ is_onboarded: true })
                    .eq('id', AuthFlow.user.id);
                
                // Allow them to proceed to admin
                window.location.href = 'admin-account.html';
                return;
            }
        }

        // --- 3. Fully Onboarded ---
        // If they try to access auth pages again, redirect to admin
        if (page.startsWith('auth-')) {
            window.location.href = 'admin-account.html';
        }
    },

    autoFillProfile: () => {
        // Auto-fill logic for LINE login
        const user = AuthFlow.user;
        const profile = AuthFlow.profile; // Can be null if not created yet (e.g. fresh register), but LINE login creates it.
        
        if (!user) return;

        // Data Sources priority: Profile (DB) > User Metadata (Auth)
        const meta = user.user_metadata || {};
        
        const fullNameInput = document.querySelector('input[name="full_name"]');
        const emailInput = document.querySelector('input[name="email"]');
        const avatarInput = document.querySelector('input[name="avatar_url"]'); // Hidden
        
        // Find avatar container
        const avatarContainer = document.querySelector('.w-28.h-28');

        // Resolve Values
        const fullName = profile?.full_name || meta.full_name || meta.name || meta.displayName || '';
        const email = user.email || '';
        const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || '';

        // Fill Inputs
        if (fullNameInput && !fullNameInput.value) {
            fullNameInput.value = fullName;
        }
        if (emailInput && !emailInput.value) {
            emailInput.value = email;
        }
        
        // Fill Avatar
        if (avatarUrl && avatarContainer) {
            // Check if img already exists
            if (!avatarContainer.querySelector('img')) {
                avatarContainer.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover" alt="Avatar">`;
            }
        }
    },

    bindEvents: () => {
        // Intercept internal links for SPA
        document.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.endsWith('.html') && href.startsWith('auth-')) {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    AuthFlow.navigateTo(href);
                });
            }
        });

        // Login Form
        const loginBtn = document.getElementById('btn-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = document.querySelector('input[type="text"]').value; // or email type
                const password = document.querySelector('input[type="password"]').value;
                
                if (!email || !password) {
                    CustomModal.alert('提示', '請輸入帳號與密碼');
                    return;
                }

                const { error } = await AuthFlow.supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    // Specific prompt as requested
                    CustomModal.alert('登入失敗', '您尚未註冊，請立即註冊或使用 LINE 帳號登入');
                }
            });
        }

        // Register Form
        const registerBtn = document.getElementById('btn-register');
        if (registerBtn) {
            registerBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = document.querySelector('input[type="email"]').value;
                const password = document.querySelector('input[placeholder*="密碼"]').value;
                const confirm = document.querySelectorAll('input[type="password"]')[1].value;

                if (!email || !password) {
                    CustomModal.alert('提示', '請填寫完整資訊');
                    return;
                }
                if (password !== confirm) {
                    CustomModal.alert('錯誤', '兩次密碼輸入不一致');
                    return;
                }

                const { error } = await AuthFlow.supabase.auth.signUp({ email, password });
                if (error) {
                    CustomModal.alert('註冊失敗', error.message);
                } else {
                    CustomModal.alert('註冊成功', '請收取驗證信或直接登入').then(() => {
                        // Ideally auto login or redirect
                        AuthFlow.navigateTo('auth-login.html');
                    });
                }
            });
        }

        // LINE Login Buttons
        const lineBtns = document.querySelectorAll('.btn-line-login');
        lineBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // Get config (cached or fetch again if needed, but we have AuthFlow.config if we stored it)
                // Since init() didn't store config in AuthFlow, we fetch it or use what we have.
                // Let's re-fetch safely or modify init to store it. 
                // For robustness, let's just fetch it here or assume it was loaded.
                // Actually, init() variables are local scope. 
                // Let's modify init to store config in AuthFlow first.
                
                // Fetch config for LINE
                try {
                    const res = await fetch('/api/config');
                    const config = await res.json();
                    
                    if (!config.lineLoginChannelId || !config.lineLoginCallbackUrl) {
                        CustomModal.alert('配置錯誤', 'LINE Login 尚未設定');
                        return;
                    }

                    // Generate random state
                    const state = Math.random().toString(36).substring(7);
                    
                    // Construct LINE Auth URL
                    const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${config.lineLoginChannelId}&redirect_uri=${encodeURIComponent(config.lineLoginCallbackUrl)}&state=${state}&scope=profile%20openid`;
                    
                    window.location.href = lineUrl;
                } catch (err) {
                    console.error('LINE Login Init Error', err);
                    CustomModal.alert('錯誤', '無法啟動 LINE 登入');
                }
            });
        });

        // Profile Form
        const profileBtn = document.getElementById('btn-save-profile');
        if (profileBtn) {
            profileBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const fullName = document.querySelector('input[placeholder="請輸入您的姓名"]').value;
                const birthday = document.querySelector('input[type="date"]').value;
                const phone = document.querySelector('input[type="tel"]').value;
                // email is usually read-only or auto-filled
                
                if (!fullName || !phone) {
                    CustomModal.alert('提示', '請填寫必填欄位');
                    return;
                }

                const { error } = await AuthFlow.supabase
                    .from('profiles')
                    .upsert({
                        id: AuthFlow.user.id,
                        full_name: fullName,
                        birthday: birthday || null,
                        phone: phone,
                        updated_at: new Date()
                    });

                if (error) {
                    CustomModal.alert('錯誤', '儲存失敗: ' + error.message);
                } else {
                    // Redirect will be handled by handleRouting or manual
                    AuthFlow.navigateTo('auth-store.html');
                }
            });
        }

        // Store Form
        const storeBtn = document.getElementById('btn-save-store');
        if (storeBtn) {
            storeBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const storeName = document.querySelector('input[placeholder="請輸入商家品牌名稱"]').value;
                const address = document.querySelector('input[placeholder="請輸入門市詳細地址"]').value;
                const phone = document.querySelector('input[placeholder="02-12345678"]').value;

                if (!storeName) {
                    CustomModal.alert('提示', '商家名稱為必填');
                    return;
                }

                // Insert Store
                const { error: storeError } = await AuthFlow.supabase
                    .from('stores')
                    .insert({
                        owner_id: AuthFlow.user.id,
                        store_name: storeName,
                        address: address,
                        store_phone: phone
                    });

                if (storeError) {
                    CustomModal.alert('錯誤', '建立商家失敗: ' + storeError.message);
                    return;
                }

                // Update Profile Onboarded
                const { error: profileError } = await AuthFlow.supabase
                    .from('profiles')
                    .update({ is_onboarded: true })
                    .eq('id', AuthFlow.user.id);

                if (profileError) {
                    CustomModal.alert('警告', '商家建立成功但狀態更新失敗');
                } else {
                    CustomModal.alert('完成', '歡迎使用玩美商家管理系統！').then(() => {
                        window.location.href = 'admin-account.html';
                    });
                }
            });
        }
    }
};

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AuthFlow.init);
} else {
    AuthFlow.init();
}
