import type { UpdateRingDto } from '@repo/portfolio-data';
import { deleteRing, updateRing } from '@repo/portfolio-data';
import { isAuthorized, unauthorizedResponse } from '../../../../lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const { id } = await params;
	const body = (await request.json()) as UpdateRingDto;
	const ring = await updateRing(Number(id), body);

	if (!ring) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	return Response.json(ring);
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
	if (!isAuthorized(request)) {
		return unauthorizedResponse();
	}

	const { id } = await params;
	const deleted = await deleteRing(Number(id));

	if (!deleted) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	return new Response(null, { status: 204 });
}
