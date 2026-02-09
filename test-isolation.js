
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load config
async function loadConfig() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const envVars = {};
            envContent.split('\n').forEach(line => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    let value = match[2].trim();
                    if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1);
                    }
                    envVars[key] = value;
                }
            });
            const result = {
                 supabaseUrl: process.env.SUPABASE_URL || envVars.SUPABASE_URL,
                 supabaseKey: process.env.SUPABASE_KEY || envVars.SUPABASE_KEY
             };
             
             if (result.supabaseUrl && result.supabaseKey) {
                 return result;
             }
         }
         
         // Fallback to empty or throw error
         return {
              supabaseUrl: process.env.SUPABASE_URL,
              supabaseKey: process.env.SUPABASE_KEY
         };
    } catch (e) {
        console.error("Error loading config:", e);
        return {};
    }
}

async function testIsolation() {
    console.log('--- 開始測試多店家會員隔離 ---');
    const config = await loadConfig();
    
    if (!config.supabaseUrl || !config.supabaseKey) {
        console.error('缺少 Supabase 設定，無法測試。請確認 pages/api/config.js 或環境變數。');
        return;
    }

    const supabase = createClient(config.supabaseUrl, config.supabaseKey);

    // 1. 模擬兩個店家 ID
    const storeA = '00000000-0000-0000-0000-000000000001'; // Mock UUID
    const storeB = '00000000-0000-0000-0000-000000000002'; // Mock UUID
    const testUser = '00000000-0000-0000-0000-000000009999'; // Mock User UUID

    console.log(`測試用戶: ${testUser}`);
    console.log(`店家 A: ${storeA}`);
    console.log(`店家 B: ${storeB}`);

    try {
        // 2. 清理舊測試資料
        console.log('\n[Step 1] 清理舊資料...');
        const { error: delError } = await supabase
            .from('profiles')
            .delete()
            .eq('user_id', testUser);
        
        if (delError) console.log('清理略過 (可能無權限或無資料):', delError.message);
        else console.log('舊資料已清理');

        // 3. 在店家 A 建立 Profile
        console.log('\n[Step 2] 在店家 A 建立會員資料...');
        const profileA = {
            user_id: testUser,
            store_id: storeA,
            display_name: 'User In Store A',
            phone: '0912345678'
        };
        
        const { data: dataA, error: errA } = await supabase
            .from('profiles')
            .upsert(profileA, { onConflict: 'user_id, store_id' })
            .select()
            .single();

        if (errA) {
            console.error('❌ 店家 A 建立失敗:', errA.message);
            console.log('可能原因：資料庫尚未執行 Migration，缺少 store_id 欄位或 Unique Constraint。');
            return;
        }
        console.log('✅ 店家 A 資料建立成功:', dataA.display_name);

        // 4. 在店家 B 查詢 (應該查不到)
        console.log('\n[Step 3] 在店家 B 查詢該用戶...');
        const { data: dataB_Query, error: errB_Query } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', testUser)
            .eq('store_id', storeB)
            .maybeSingle();

        if (dataB_Query) {
            console.error('❌ 隔離失敗！在店家 B 查到了資料:', dataB_Query);
        } else {
            console.log('✅ 隔離成功！在店家 B 查無資料 (符合預期)');
        }

        // 5. 在店家 B 建立不同 Profile
        console.log('\n[Step 4] 在店家 B 建立不同會員資料...');
        const profileB = {
            user_id: testUser,
            store_id: storeB,
            display_name: 'User In Store B', // Different name
            phone: '0987654321' // Different phone
        };

        const { data: dataB, error: errB } = await supabase
            .from('profiles')
            .upsert(profileB, { onConflict: 'user_id, store_id' })
            .select()
            .single();

        if (errB) {
            console.error('❌ 店家 B 建立失敗:', errB.message);
        } else {
            console.log('✅ 店家 B 資料建立成功:', dataB.display_name);
        }

        // 6. 最終驗證
        console.log('\n[Step 5] 最終驗證...');
        const { data: finalA } = await supabase.from('profiles').select('display_name').eq('user_id', testUser).eq('store_id', storeA).single();
        const { data: finalB } = await supabase.from('profiles').select('display_name').eq('user_id', testUser).eq('store_id', storeB).single();

        console.log(`店家 A 的用戶名: ${finalA?.display_name}`);
        console.log(`店家 B 的用戶名: ${finalB?.display_name}`);

        if (finalA?.display_name !== finalB?.display_name) {
            console.log('🎉 測試通過！同一用戶在不同店家擁有獨立資料。');
        } else {
            console.error('⚠️ 測試異常：資料似乎未正確隔離。');
        }

    } catch (e) {
        console.error('測試過程發生未預期錯誤:', e);
    }
}

testIsolation();
