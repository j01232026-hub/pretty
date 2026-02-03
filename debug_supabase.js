
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yudtmjpmdlvedfrstpsp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZHRtanBtZGx2ZWRmcnN0cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5OTcxODcsImV4cCI6MjA4NTU3MzE4N30.UdJj1UGGeGR8o9zwlagcG8uFTHyczJ1LYfFiLsvfFsE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    console.log('Checking profiles table...');
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Error fetching profiles:', error);
    } else {
        console.log('Profiles data (first 5):');
        console.log(JSON.stringify(data, null, 2));
        
        if (data.length > 0) {
            const firstRecord = data[0];
            console.log('\nField check:');
            console.log('Has avatar_url?', 'avatar_url' in firstRecord);
            console.log('Has picture_url?', 'picture_url' in firstRecord);
        }
    }
}

checkProfiles();
