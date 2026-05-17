import { getGasparUrl } from '@/lib/config';
import { initLogger } from '@repo/logger/server';
import { NextResponse } from 'next/server';

const log = initLogger('api/gaspar-proxy');

type Params = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, { params }: Params): Promise<Response> {
	const { path } = await params;
	const gasparUrl = getGasparUrl();
	const pathStr = path.join('/');

	const { search } = new URL(request.url);
	const target = `${gasparUrl}/${pathStr}${search}`;

	try {
		const init: RequestInit = { method: request.method };
		if (request.method !== 'GET' && request.method !== 'DELETE') {
			init.body = await request.text();
			init.headers = { 'content-type': 'application/json' };
		}
		const upstream = await fetch(target, init);
		const data = await upstream.json();
		return NextResponse.json(data, { status: upstream.status });
	} catch (err) {
		log.error({ err, target }, 'Gaspar proxy error');
		return NextResponse.json({ error: 'Gaspar unreachable' }, { status: 502 });
	}
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
