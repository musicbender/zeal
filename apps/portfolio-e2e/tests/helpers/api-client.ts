import type { APIRequestContext } from '@playwright/test';

export function getApiKey(): string {
  const key = process.env.PORTFOLIO_API_KEY;
  if (!key) throw new Error('PORTFOLIO_API_KEY is not set');
  return key;
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }
  return headers;
}

export function makeApiClient(request: APIRequestContext, apiKey: string) {
  const headers = authHeaders(apiKey);
  return {
    post: (path: string, body: unknown) => request.post(path, { data: body, headers }),
    patch: (path: string, body: unknown) => request.patch(path, { data: body, headers }),
    delete: (path: string) => request.delete(path, { headers }),
  };
}
