// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/neon-data', () => ({
  updateRing: vi.fn(),
  deleteRing: vi.fn(),
}));

import { updateRing, deleteRing } from '@repo/neon-data';
import { PATCH, DELETE } from './route';

const API_KEY = 'test-key';
const mockRing = {
  id: 1,
  name: 'Updated Ring',
  description: null,
  base_material: 'Gold',
  other_materials: [],
  techniques: [],
  gemstones: [],
  size: '6.00',
  weight_grams: '4.00',
  images: [],
  created_on: new Date(),
};

function makeRequest(method: string, body?: unknown, authorized = true): Request {
  return new Request('http://localhost/api/rings/1', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const ctx = { params: Promise.resolve({ id: '1' }) };

describe('PATCH /api/rings/[id]', () => {
  beforeEach(() => {
    process.env.PORTFOLIO_API_KEY = API_KEY;
  });

  afterEach(() => {
    delete process.env.PORTFOLIO_API_KEY;
    vi.clearAllMocks();
  });

  it('returns 401 when not authorized', async () => {
    const res = await PATCH(makeRequest('PATCH', {}, false), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when ring does not exist', async () => {
    vi.mocked(updateRing).mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest('PATCH', { base_material: 'Gold' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns updated ring on success', async () => {
    vi.mocked(updateRing).mockResolvedValueOnce(mockRing);
    const res = await PATCH(makeRequest('PATCH', { base_material: 'Gold' }), ctx);
    expect(res.status).toBe(200);
    expect(updateRing).toHaveBeenCalledWith(1, { base_material: 'Gold' });
  });
});

describe('DELETE /api/rings/[id]', () => {
  beforeEach(() => {
    process.env.PORTFOLIO_API_KEY = API_KEY;
  });

  afterEach(() => {
    delete process.env.PORTFOLIO_API_KEY;
    vi.clearAllMocks();
  });

  it('returns 401 when not authorized', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, false), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when ring does not exist', async () => {
    vi.mocked(deleteRing).mockResolvedValueOnce(false);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful delete', async () => {
    vi.mocked(deleteRing).mockResolvedValueOnce(true);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(204);
  });
});
