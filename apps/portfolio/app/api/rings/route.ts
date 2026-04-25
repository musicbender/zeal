import type { CreateRingDto } from '@repo/portfolio-data';
import { createRing } from '@repo/portfolio-data';
import { isAuthorized, unauthorizedResponse } from '../../../lib/api-auth';

export async function POST(request: Request): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const body = (await request.json()) as CreateRingDto;
	const ring = await createRing(body);
	return Response.json(ring, { status: 201 });
}
