import { google } from 'googleapis';

export default async function handler(req, res) {
  const report = {
    steps: [],
    env: {},
    error: null,
  };

  try {
    // 1. Check Env Vars existence
    report.env.hasServiceAccountKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    report.env.hasCalendarId = !!process.env.GOOGLE_CALENDAR_ID;
    report.steps.push('Environment variables check passed');

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
    }

    // 2. Parse JSON
    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      report.steps.push('JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY) passed');
    } catch (e) {
      throw new Error(`JSON Parse Failed: ${e.message}`);
    }

    // 3. Check Key Structure
    const hasClientEmail = !!serviceAccountKey.client_email;
    const hasPrivateKey = !!serviceAccountKey.private_key;
    report.steps.push(`Key structure check: email=${hasClientEmail}, privateKey=${hasPrivateKey}`);

    if (!hasPrivateKey) {
      throw new Error('private_key is missing in the JSON');
    }

    // 4. Sanitize Key
    const originalKeyLength = serviceAccountKey.private_key.length;
    const privateKey = serviceAccountKey.private_key.replace(/\\n/g, '\n');
    report.steps.push(`Private Key sanitized (original length: ${originalKeyLength}, new length: ${privateKey.length})`);
    
    // Check if it looks like a PEM key
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      report.steps.push('WARNING: Private key does not contain "BEGIN PRIVATE KEY" header');
    }

    // 5. Auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: serviceAccountKey.client_email,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const authClient = await auth.getClient();
    report.steps.push('GoogleAuth.getClient() passed');

    // 6. API Call (List Events)
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    report.steps.push('Calendar client created');

    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) throw new Error('Missing GOOGLE_CALENDAR_ID');

    const resCalendar = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 1,
      singleEvents: true,
      orderBy: 'startTime',
    });

    report.steps.push('calendar.events.list() passed');
    report.calendarCheck = {
      summary: resCalendar.data.summary,
      timeZone: resCalendar.data.timeZone,
    };

    res.status(200).json({ status: 'OK', report });

  } catch (error) {
    console.error('Test Failed:', error);
    report.error = {
      message: error.message,
      stack: error.stack,
      response: error.response?.data, // Capture Google API error details
    };
    res.status(500).json({ status: 'ERROR', report });
  }
}
