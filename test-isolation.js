const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables manually
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const envConfig = process.env;

/*
const envPath = path.resolve(__dirname, '.env');
console.log('Loading .env from:', envPath);
const envConfig = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        // console.log('Line:', JSON.stringify(line));
        const match = line.match(/^\s*([^=]+?)\s*=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            envConfig[key] = value;
        }
    });
}
console.log('Found keys:', Object.keys(envConfig));
*/

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || envConfig.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function runTest() {
    console.log('Starting Multi-Tenancy Isolation Test...');

    const storeIdA = crypto.randomUUID();
    const storeIdB = crypto.randomUUID();
    const testLineId = 'line_user_' + Date.now();
    const displayName = 'Test User';

    // 1. Create User (simulate LINE login user creation)
    const dummyEmail = `${testLineId}@pretty.app`;
    let userId;
    
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: dummyEmail,
        email_confirm: true,
        user_metadata: { full_name: displayName, line_id: testLineId }
    });

    if (userError) {
        console.error('Error creating auth user:', userError);
        // Try to find if exists
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const found = listData.users.find(u => u.email === dummyEmail);
        if (found) userId = found.id;
        else throw userError;
    } else {
        userId = userData.user.id;
    }

    console.log(`Test User ID: ${userId}`);

    // 2. Create Stores
    console.log(`Creating stores: ${storeIdA}, ${storeIdB}`);
    const { error: storeError } = await supabaseAdmin.from('stores').insert([
        { id: storeIdA, store_name: 'Store A', address: 'Addr A', store_phone: '111', owner_id: userId, created_at: new Date() },
        { id: storeIdB, store_name: 'Store B', address: 'Addr B', store_phone: '222', owner_id: userId, created_at: new Date() }
    ]);

    if (storeError) {
        console.error('Error creating stores:', storeError);
        process.exit(1);
    }

    // 3. Create Profile for Store A
    console.log('Creating profile for Store A...');
    const profileA = {
        id: crypto.randomUUID(),
        user_id: userId,
        store_id: storeIdA,
        display_name: displayName + ' (A)',
        phone: '0912345678',
        birthday: '1990-01-01',
        email: dummyEmail,
        is_complete: true,
        created_at: new Date(),
        updated_at: new Date()
    };

    const { data: dataA, error: errorA } = await supabaseAdmin
        .from('profiles')
        .insert(profileA)
        .select()
        .single();

    if (errorA) {
        console.error('Error creating profile A:', errorA);
    } else {
        console.log('Profile A created:', dataA.id);
    }

    // 4. Create Profile for Store B
    console.log('Creating profile for Store B...');
    const profileB = {
        id: crypto.randomUUID(),
        user_id: userId,
        store_id: storeIdB,
        display_name: displayName + ' (B)',
        phone: '0987654321',
        birthday: '1990-02-02',
        email: dummyEmail,
        is_complete: true,
        created_at: new Date(),
        updated_at: new Date()
    };

    const { data: dataB, error: errorB } = await supabaseAdmin
        .from('profiles')
        .insert(profileB)
        .select()
        .single();

    if (errorB) {
        console.error('Error creating profile B:', errorB);
    } else {
        console.log('Profile B created:', dataB.id);
    }

    // 5. Verify Isolation
    console.log('Verifying isolation...');
    
    // Check Store A view
    const { data: viewA } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('store_id', storeIdA)
        .eq('user_id', userId);
    
    console.log(`Profiles found for Store A: ${viewA.length}`);
    if (viewA.length === 1 && viewA[0].display_name === displayName + ' (A)') {
        console.log('PASS: Store A sees correct profile.');
    } else {
        console.error('FAIL: Store A profile mismatch.', viewA);
    }

    // Check Store B view
    const { data: viewB } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('store_id', storeIdB)
        .eq('user_id', userId);
        
    console.log(`Profiles found for Store B: ${viewB.length}`);
    if (viewB.length === 1 && viewB[0].display_name === displayName + ' (B)') {
        console.log('PASS: Store B sees correct profile.');
    } else {
        console.error('FAIL: Store B profile mismatch.', viewB);
    }

    // Cleanup (optional)
    console.log('Cleaning up...');
    await supabaseAdmin.from('profiles').delete().eq('user_id', userId);
    await supabaseAdmin.from('stores').delete().in('id', [storeIdA, storeIdB]);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    console.log('Done.');
}

runTest().catch(console.error);
