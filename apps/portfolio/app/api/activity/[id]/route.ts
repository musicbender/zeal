import { updateActivity, deleteActivity } from '@repo/neon-data';
import type { UpdateActivityDto } from '@repo/neon-data';
import { isAuthorized, unauthorizedResponse } from '../../../../lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  const body = (await request.json()) as UpdateActivityDto;
  const activity = await updateActivity(Number(id), body);

  if (!activity) {
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
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
