export function getApiBaseUrl(): string {
	const url = process.env.API_BASE_URL ?? 'http://localhost:3002';
	return url;
}
