export const dynamic = 'force-dynamic';

export default async function TeslaCallbackPage({
	searchParams,
}: {
	searchParams: Promise<{ code?: string }>;
}) {
	const { code } = await searchParams;

	if (!code) {
		return (
			<main
				style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 16px' }}
			>
				<h2>Tesla authorization failed</h2>
				<p>Missing code parameter.</p>
			</main>
		);
	}

	const clientId = process.env.TESLA_CLIENT_ID;
	const clientSecret = process.env.TESLA_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		return (
			<main
				style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 16px' }}
			>
				<h2>Server misconfiguration</h2>
				<p>Missing Tesla credentials.</p>
			</main>
		);
	}

	const tokenRes = await fetch('https://auth.tesla.com/oauth2/v3/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: 'https://www.patjacobs.com/tesla/callback',
		}),
	});

	if (!tokenRes.ok) {
		const text = await tokenRes.text();
		return (
			<main
				style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 16px' }}
			>
				<h2>Token exchange failed ({tokenRes.status})</h2>
				<pre
					style={{
						background: '#f4f4f4',
						padding: 16,
						wordBreak: 'break-all',
						whiteSpace: 'pre-wrap',
					}}
				>
					{text}
				</pre>
			</main>
		);
	}

	const body = (await tokenRes.json()) as Record<string, unknown>;
	const refreshToken = body['refresh_token'];

	if (typeof refreshToken !== 'string' || !refreshToken) {
		return (
			<main
				style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 16px' }}
			>
				<h2>Invalid response from Tesla</h2>
				<p>Missing refresh_token in response.</p>
			</main>
		);
	}

	return (
		<main
			style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 16px' }}
		>
			<h2>Tesla authorization complete</h2>
			<p>
				Copy this refresh token to your Pi&apos;s <code>.env</code> as{' '}
				<code>TESLA_REFRESH_TOKEN</code>:
			</p>
			<pre
				style={{
					background: '#f4f4f4',
					padding: 16,
					wordBreak: 'break-all',
					whiteSpace: 'pre-wrap',
				}}
			>
				{refreshToken}
			</pre>
			<p>
				<strong>Keep this token secret.</strong> Close this tab when done.
			</p>
		</main>
	);
}
