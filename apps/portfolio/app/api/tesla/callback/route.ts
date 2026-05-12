export async function GET(request: Request): Promise<Response> {
	const { searchParams } = new URL(request.url);
	const code = await searchParams.get('code');

	if (!code) {
		return new Response('Missing code parameter', { status: 400 });
	}

	const clientId = process.env.TESLA_CLIENT_ID;
	const clientSecret = process.env.TESLA_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		return new Response('Server misconfiguration: missing Tesla credentials', { status: 500 });
	}

	const tokenRes = await fetch('https://auth.tesla.com/oauth2/v3/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: 'https://patjacobs.com/api/tesla/callback',
		}),
	});

	if (!tokenRes.ok) {
		const text = await tokenRes.text();
		return new Response(`Tesla token exchange failed (${tokenRes.status}):\n${text}`, {
			status: 502,
		});
	}

	const tokens = (await tokenRes.json()) as { refresh_token: string };

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tesla OAuth Complete</title>
  <style>body{font-family:monospace;max-width:700px;margin:40px auto;padding:0 16px}</style>
</head>
<body>
  <h2>Tesla authorization complete</h2>
  <p>Copy this refresh token to your Pi's <code>.env</code> as <code>TESLA_REFRESH_TOKEN</code>:</p>
  <pre style="background:#f4f4f4;padding:16px;word-break:break-all;white-space:pre-wrap">${tokens.refresh_token}</pre>
  <p><strong>Keep this token secret.</strong> Close this tab when done.</p>
</body>
</html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html' },
	});
}
