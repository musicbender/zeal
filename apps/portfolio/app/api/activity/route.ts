import type { CreateActivityDto } from '@repo/portfolio-data';
import { createActivity } from '@repo/portfolio-data';
import { isAuthorized, unauthorizedResponse } from '../../../lib/api-auth';

export async function POST(request: Request): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const body = (await request.json()) as CreateActivityDto;
	const activity = await createActivity(body);
	return Response.json(activity, { status: 201 });
}
