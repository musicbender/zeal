// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/neon-data', () => ({
  createRing: vi.fn(),
}));

import { createRing } from '@repo/neon-data';
import { POST } from './route';

const API_KEY = 'test-key';
const mockRing = {
  id: 1,
  name: 'Test Ring',
  description: 'A test ring',
  base_material: 'Silver',
  other_materials: [],
  techniques: [],
  gemstones: [],
  size: '7.00',
  weight_grams: '3.50',
  images: [],
  created_on: new Date(),
};

function makeRequest(body: unknown, authorized = true): Request {
  return new Request('http://localhost/api/rings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rings', () => {
  beforeEach(() => {
    process.env.PORTFOLIO_API_KEY = API_KEY;
  });

  afterEach(() => {
    delete process.env.PORTFOLIO_API_KEY;
    vi.clearAllMocks();
  });

  it('returns 401 when not authorized', async () => {
    const res = await POST(makeRequest({}, false));
    expect(res.status).toBe(401);
  });

  it('creates a ring and returns 201', async () => {
    vi.mocked(createRing).mockResolvedValueOnce(mockRing);

    const dto = { name: 'Test Ring', base_material: 'Silver', size: 7, weight_grams: 3.5 };
    const res = await POST(makeRequest(dto));
    expect(res.status).toBe(201);
    expect(createRing).toHaveBeenCalledWith(dto);
  });
});
