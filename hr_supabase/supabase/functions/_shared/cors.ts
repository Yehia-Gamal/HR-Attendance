const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('SITE_URL') || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const devOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

export function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigins = new Set([...envOrigins, ...devOrigins]);
  const allowOrigin = allowedOrigins.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function options(req: Request) {
  return new Response('ok', { headers: buildCorsHeaders(req) });
}

export function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}
