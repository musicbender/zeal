import { initLogger } from '@repo/logger/server';
import type { UpdateActivityDto } from '@repo/portfolio-data';
import { deleteActivity, updateActivity } from '@repo/portfolio-data';
import { isAuthorized, unauthorizedResponse } from '../../../../lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

const log = initLogger('cron/activity/id');

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const { id } = await params;
	const body = (await request.json()) as UpdateActivityDto;
	const activity = await updateActivity(Number(id), body);

	if (!activity) {
		log.error('Activity not found.');
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	return Response.json(activity);
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const { id } = await params;
	const deleted = await deleteActivity(Number(id));

	if (!deleted) {
		log.error('Activity not found.');
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	return new Response(null, { status: 204 });
}
