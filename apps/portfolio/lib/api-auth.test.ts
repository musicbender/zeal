// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAuthorized, unauthorizedResponse } from './api-auth';

const API_KEY = 'test-secret-key';

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe('isAuthorized', () => {
  beforeEach(() => {
    process.env.PORTFOLIO_API_KEY = API_KEY;
  });

  afterEach(() => {
    delete process.env.PORTFOLIO_API_KEY;
  });

  it('returns true for a valid Bearer token', () => {
    expect(isAuthorized(makeRequest(`Bearer ${API_KEY}`))).toBe(true);
  });

  it('returns false when the token is wrong', () => {
    expect(isAuthorized(makeRequest('Bearer wrong-key'))).toBe(false);
  });

  it('returns false when the Authorization header is missing', () => {
    expect(isAuthorized(makeRequest())).toBe(false);
  });

  it('returns false when PORTFOLIO_API_KEY env var is not set', () => {
    delete process.env.PORTFOLIO_API_KEY;
    expect(isAuthorized(makeRequest(`Bearer ${API_KEY}`))).toBe(false);
  });

  it('returns false for a non-Bearer scheme', () => {
    expect(isAuthorized(makeRequest(`Basic ${API_KEY}`))).toBe(false);
  });
});

describe('unauthorizedResponse', () => {
  it('returns a 401 response with JSON error body', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});
