import type { APIRequestContext } from '@playwright/test';

export function getApiKey(): string {
  const key = process.env.PORTFOLIO_API_KEY;
  if (!key) throw new Error('PORTFOLIO_API_KEY is not set');
  return key;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export function makeApiClient(request: APIRequestContext, apiKey: string) {
  const headers = authHeaders(apiKey);
  return {
    post: (path: string, body: unknown) => request.post(path, { data: body, headers }),
    patch: (path: string, body: unknown) => request.patch(path, { data: body, headers }),
    delete: (path: string) => request.delete(path, { headers }),
  };
}
