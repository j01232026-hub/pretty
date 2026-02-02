const crypto = require('crypto');
const axios = require('axios');
const supabase = require('../../lib/supabaseClient');

// 1. 告訴 Vercel 不要處理 Body，我們要拿原始資料
export const config = {
  api: {
    bodyParser: false,
  },
};

// 小工具：讀取原始資料 (Raw Body)
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    // 2. 確認是 POST 方法
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    // 3. 讀取 Raw Body
    const rawBodyBuffer = await getRawBody(req);
    const rawBody = rawBodyBuffer.toString('utf-8');

    // 4. 驗證身分 (簽名比對)
    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!signature || !channelSecret) {
      return res.status(401).send('Missing signature or channel secret');
    }

    const expectedSignature = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBodyBuffer) // 使用 Buffer 計算更準確
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error('Signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // 5. 處理預約邏輯
    const body = JSON.parse(rawBody);
    const events = body.events || [];

    for (const event of events) {
      // 只處理訊息事件
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;

        // 檢查是否包含預約關鍵字
        if (userMessage.includes('{"action": "book"}')) {
          console.log('收到預約請求:', userMessage);

          // 6. 存入 Supabase
          const { error } = await supabase
            .from('bookings') // 假設資料表叫做 bookings
            .insert([
              {
                user_id: event.source.userId,
                message: userMessage,
                created_at: new Date().toISOString(),
                raw_event: event
              },
            ]);

          if (error) {
            console.error('Supabase 寫入錯誤:', error);
            // 就算資料庫存失敗，可能還是要回覆使用者，或者不回覆視為失敗
            // 這裡選擇繼續嘗試回覆
          }

          // 7. 回覆 LINE 訊息
          const replyToken = event.replyToken;
          const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

          if (replyToken && accessToken) {
            await axios.post(
              'https://api.line.me/v2/bot/message/reply',
              {
                replyToken: replyToken,
                messages: [
                  {
                    type: 'text',
                    text: '✅ 預約已確認！',
                  },
                ],
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            console.log('預約確認訊息已發送');
          }
        }
      }
    }

    // 8. 回傳 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
