
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

        } catch (e) {
            console.error('Auth Init Error:', e);
        }
    },

    handleRouting: async () => {
        const path = window.location.pathname;
        const page = path.split('/').pop();
        
        // Skip routing if not on auth pages (optional, but good for safety)
        if (!page.startsWith('auth-') && page !== 'admin-account.html') {
             // If we are on index.html, maybe redirect to auth-login?
             // Leaving this flexible for now.
        }

        // --- 1. Not Logged In ---
        if (!AuthFlow.user) {
            if (page !== 'auth-login.html' && page !== 'auth-register.html') {
                window.location.href = 'auth-login.html';
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
            if (page !== 'auth-profile.html') {
                window.location.href = 'auth-profile.html';
            } else {
                // We are on profile page, try to auto-fill LINE data
                AuthFlow.autoFillProfile();
            }
            return;
        }

        // Case B: Profile Exists but Not Onboarded (Check Store)
        if (!AuthFlow.profile.is_onboarded) {
            // Check if store exists
            const { data: store } = await AuthFlow.supabase
                .from('stores')
                .select('id')
                .eq('owner_id', AuthFlow.profile.id)
                .single();

            if (!store) {
                // No store -> Go to Store Setup
                if (page !== 'auth-store.html') {
                    window.location.href = 'auth-store.html';
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
                
                window.location.href = 'admin-account.html';
                return;
            }
        }

        // --- 3. Fully Onboarded ---
        if (page.startsWith('auth-')) {
            window.location.href = 'admin-account.html';
        }
    },

    autoFillProfile: () => {
        // Auto-fill logic for LINE login
        const user = AuthFlow.user;
        if (!user) return;

        // Check for LINE metadata or Google etc.
        const meta = user.user_metadata || {};
        const fullNameInput = document.querySelector('input[name="full_name"]');
        const emailInput = document.querySelector('input[name="email"]');
        const avatarInput = document.querySelector('input[name="avatar_url"]'); // Hidden or visible

        if (fullNameInput && !fullNameInput.value) {
            fullNameInput.value = meta.full_name || meta.name || meta.displayName || '';
        }
        if (emailInput && !emailInput.value) {
            emailInput.value = user.email || '';
        }
        // If we had an avatar display
        if (meta.avatar_url || meta.picture) {
            // Update UI if exists
        }
    },

    bindEvents: () => {
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
                        window.location.href = 'auth-login.html';
                    });
                }
            });
        }

        // LINE Login Buttons
        const lineBtns = document.querySelectorAll('.btn-line-login');
        lineBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const { error } = await AuthFlow.supabase.auth.signInWithOAuth({
                    provider: 'line',
                    options: {
                        redirectTo: window.location.origin + '/auth-profile.html'
                    }
                });
                if (error) CustomModal.alert('LINE 登入錯誤', error.message);
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
                    window.location.href = 'auth-store.html';
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
