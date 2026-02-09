import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import querystring from 'querystring'

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { code, state } = req.query

  // If no code, this might be an initiation request (optional, but good for testing)
  if (!code) {
    return res.redirect('/auth-login.html?error=missing_code')
  }

  // 0. Check Env Vars
  if (!process.env.LINE_LOGIN_CHANNEL_ID || !process.env.LINE_LOGIN_CHANNEL_SECRET || !process.env.LINE_LOGIN_CALLBACK_URL) {
     console.error('LINE Login: Missing Env Vars');
     return res.redirect('/auth-login.html?error=config_error&message=' + encodeURIComponent('系統配置錯誤：缺少 LINE 環境變數'))
  }

  try {
    // 1. Exchange code for access token & id_token
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.LINE_LOGIN_CALLBACK_URL,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID,
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    const { id_token } = tokenResponse.data

    // 2. Decode id_token to get user info (sub, name, picture)
    // id_token is a JWT. We can just decode the payload since we trust the direct response from LINE.
    const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString())
    const { sub: lineId, name, picture } = payload

    // 3. Check if user exists in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_onboarded')
      .eq('line_id', lineId)
      .single()

    let userId
    let isNewUser = false

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      isNewUser = true
      // 4. If not exists, create new Supabase Auth user
      // We use a dummy email based on line_id to satisfy Supabase Auth requirements
      const email = `line_${lineId}@pretty.app` 
      
      try {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: { full_name: name, avatar_url: picture, line_id: lineId }
        })
        if (createError) throw createError
        userId = newUser.user.id
      } catch (err) {
        // If user already exists (orphan auth user), find them
        if (err.message?.includes('already been registered') || err.code === 'email_exists' || (err.response?.data?.msg || '').includes('already been registered')) {
            console.log('User exists in Auth but not in Profiles. Recovering...');
            
            // Pagination Search to find the user ID
            let page = 1;
            let found = false;
            while (!found && page <= 50) { // Limit to 50 pages (5000 users) for safety
                const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: page, perPage: 100 });
                
                if (listError) throw listError;
                if (!users || users.length === 0) break;
                
                const target = users.find(u => u.email === email);
                if (target) {
                    userId = target.id;
                    found = true;
                }
                page++;
            }
            
            if (!userId) {
                throw new Error(`User ${email} exists but could not be found via Admin API`);
            }
        } else {
            throw err;
        }
      }

      // Create Profile record
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          line_id: lineId,
          full_name: name,
          avatar_url: picture,
          is_onboarded: false
        })
      
      if (profileError) throw profileError
    }

    // 5. Generate Magic Link for passwordless login
    // Determine redirect target
    // If existing and onboarded -> Admin
    // If new or not onboarded -> Auth Profile (signin03)
    
    // Check onboarding status again (if existing)
    const targetPage = (existingProfile && existingProfile.is_onboarded) 
      ? '/admin-account.html' 
      : '/auth-profile.html' // signin03

    // Construct the absolute redirect URL
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers.host
    const absoluteTarget = `${protocol}://${host}${targetPage}`

    // Generate link
    // We use the email associated with the user
    const email = `line_${lineId}@pretty.app`
    const { data: linkDataWithRedirect, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: absoluteTarget
      }
    })

    if (linkError) throw linkError

    // Redirect the user to the Supabase verification link
    // This will set the session cookies and then redirect to our targetPage
    return res.redirect(linkDataWithRedirect.properties.action_link)

  } catch (error) {
    console.error('LINE Login Error:', error.response?.data || error.message)
    
    // Determine Error Message
    let msg = '登入失敗，請稍後再試';
    if (error.response?.data) {
        // LINE API Error
        msg = `LINE 錯誤: ${error.response.data.error_description || error.response.data.error || JSON.stringify(error.response.data)}`;
    } else if (error.message) {
        msg = `系統錯誤: ${error.message}`;
    }

    // Redirect to login page with error
    return res.redirect('/auth-login.html?error=line_login_failed&message=' + encodeURIComponent(msg))
  }
}
