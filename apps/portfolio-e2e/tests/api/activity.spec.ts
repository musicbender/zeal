import { expect, test } from '@playwright/test';
import { getApiKey, makeApiClient } from '../helpers/api-client';

test.describe('Activity API', () => {
  const createdIds: number[] = [];

  test.afterAll(async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    for (const id of createdIds) {
      await client.delete(`/api/activity/${id}`);
    }
  });

  test('POST /api/activity — creates a new activity record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    const dto = {
      sampled_on: new Date().toISOString(),
      step_count: 7500,
      exercise_minutes: 25,
      calories_burned: 320,
      minutes_standing: 8,
    };

    const res = await client.post('/api/activity', dto);
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.step_count).toBe(dto.step_count);
    expect(body.exercise_minutes).toBe(dto.exercise_minutes);
    expect(body.minutes_standing).toBe(dto.minutes_standing);

    createdIds.push(body.id as number);
  });

  test('PATCH /api/activity/:id — updates an existing activity record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    // Create a record to update
    const createRes = await client.post('/api/activity', {
      sampled_on: new Date().toISOString(),
      step_count: 5000,
      exercise_minutes: 15,
      calories_burned: 200,
      minutes_standing: 5,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdIds.push(created.id as number);

    const patchRes = await client.patch(`/api/activity/${created.id}`, { step_count: 9999 });
    expect(patchRes.status()).toBe(200);

    const updated = await patchRes.json();
    expect(updated.id).toBe(created.id);
    expect(updated.step_count).toBe(9999);
    // Unpatched fields should be unchanged
    expect(updated.exercise_minutes).toBe(15);
  });

  test('DELETE /api/activity/:id — deletes an activity record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    // Create a record to delete
    const createRes = await client.post('/api/activity', {
      sampled_on: new Date().toISOString(),
      step_count: 1000,
      exercise_minutes: 5,
      calories_burned: 50,
      minutes_standing: 1,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deleteRes = await client.delete(`/api/activity/${created.id}`);
    expect(deleteRes.status()).toBe(204);
  });

  test('PATCH /api/activity/:id — returns 404 for unknown id', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    const res = await client.patch('/api/activity/999999999', { step_count: 1 });
    expect(res.status()).toBe(404);
  });

  test('DELETE /api/activity/:id — returns 404 for unknown id', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    const res = await client.delete('/api/activity/999999999');
    expect(res.status()).toBe(404);
  });

  test('POST /api/activity — returns 401 without API key', async ({ request }) => {
    const res = await request.post('/api/activity', {
      data: { sampled_on: new Date().toISOString(), step_count: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });
});
