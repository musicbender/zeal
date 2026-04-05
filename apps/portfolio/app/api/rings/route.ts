import { createRing } from '@repo/neon-data';
import type { CreateRingDto } from '@repo/neon-data';
import { isAuthorized, unauthorizedResponse } from '../../../lib/api-auth';

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as CreateRingDto;
  const ring = await createRing(body);
  return Response.json(ring, { status: 201 });
}
