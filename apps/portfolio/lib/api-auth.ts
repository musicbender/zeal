export function isAuthorized(request: Request): boolean {
  const apiKey = process.env.PORTFOLIO_API_KEY;
  if (!apiKey) return false;
  const authHeader = request.headers.get('Authorization');
  return authHeader === `Bearer ${apiKey}`;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
