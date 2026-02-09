export default function handler(req, res) {
    // 為了安全起見，這裡只回傳必要的公開資訊
    // 注意：SUPABASE_KEY 應該要是 Anon Key (公開金鑰)，而非 Service Role Key (私密金鑰)
    // 根據目前的 .env 檢查結果，SUPABASE_KEY 看起來是 Anon Key (role: "anon")
    
    res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY,
        lineLoginChannelId: process.env.LINE_LOGIN_CHANNEL_ID,
        lineLoginCallbackUrl: process.env.LINE_LOGIN_CALLBACK_URL
    });
}
