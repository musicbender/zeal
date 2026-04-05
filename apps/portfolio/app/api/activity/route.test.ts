// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/neon-data', () => ({
  createActivity: vi.fn(),
}));

import { createActivity } from '@repo/neon-data';
import { POST } from './route';

const API_KEY = 'test-key';
const mockActivity = {
  id: 1,
  sampled_on: new Date('2026-04-04T10:00:00Z'),
  step_count: 8000,
  exercise_minutes: 30,
  calories_burned: '450.00',
  minutes_standing: 10,
  created_on: new Date(),
};

function makeRequest(body: unknown, authorized = true): Request {
  return new Request('http://localhost/api/activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/activity', () => {
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

  it('creates an activity and returns 201', async () => {
    vi.mocked(createActivity).mockResolvedValueOnce(mockActivity);

    const dto = {
      sampled_on: '2026-04-04T10:00:00Z',
      step_count: 8000,
      exercise_minutes: 30,
      calories_burned: 450,
      minutes_standing: 10,
    };

    const res = await POST(makeRequest(dto));
    expect(res.status).toBe(201);
    expect(createActivity).toHaveBeenCalledWith(dto);
  });
});
