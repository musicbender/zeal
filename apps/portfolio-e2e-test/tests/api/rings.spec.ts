import { expect, test } from '@playwright/test';
import { getApiKey, makeApiClient } from '../helpers/api-client';

test.describe('Rings API', () => {
  const createdIds: number[] = [];

  test.afterAll(async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    for (const id of createdIds) {
      await client.delete(`/api/rings/${id}`);
    }
  });

  test('POST /api/rings — creates a new ring record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    const dto = {
      name: 'E2E Test Ring',
      description: 'Created by e2e test suite',
      base_material: 'Sterling Silver',
      other_materials: ['Copper'],
      techniques: ['Soldering', 'Hammering'],
      gemstones: ['Turquoise'],
      size: 7.5,
      weight_grams: 4.2,
      images: [],
    };

    const res = await client.post('/api/rings', dto);
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe(dto.name);
    expect(body.base_material).toBe(dto.base_material);
    expect(body.other_materials).toEqual(dto.other_materials);
    expect(body.techniques).toEqual(dto.techniques);
    expect(body.gemstones).toEqual(dto.gemstones);

    createdIds.push(body.id as number);
  });

  test('PATCH /api/rings/:id — updates an existing ring record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    // Create a record to update
    const createRes = await client.post('/api/rings', {
      name: 'E2E Patch Target',
      base_material: 'Brass',
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdIds.push(created.id as number);

    const patchRes = await client.patch(`/api/rings/${created.id}`, {
      base_material: 'Gold',
      techniques: ['Casting'],
    });
    expect(patchRes.status()).toBe(200);

    const updated = await patchRes.json();
    expect(updated.id).toBe(created.id);
    expect(updated.base_material).toBe('Gold');
    expect(updated.techniques).toEqual(['Casting']);
    // Unpatched fields should be unchanged
    expect(updated.name).toBe('E2E Patch Target');
  });

  test('DELETE /api/rings/:id — deletes a ring record', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());

    const createRes = await client.post('/api/rings', {
      name: 'E2E Delete Target',
      base_material: 'Copper',
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deleteRes = await client.delete(`/api/rings/${created.id}`);
    expect(deleteRes.status()).toBe(204);
  });

  test('PATCH /api/rings/:id — returns 404 for unknown id', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    const res = await client.patch('/api/rings/999999999', { name: 'Ghost' });
    expect(res.status()).toBe(404);
  });

  test('DELETE /api/rings/:id — returns 404 for unknown id', async ({ request }) => {
    const client = makeApiClient(request, getApiKey());
    const res = await client.delete('/api/rings/999999999');
    expect(res.status()).toBe(404);
  });

  test('POST /api/rings — returns 401 without API key', async ({ request }) => {
    const res = await request.post('/api/rings', {
      data: { name: 'Unauthorized Ring' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });
});
