import { IRequest } from '../router';

export function corsMiddleware(request: IRequest): Response | undefined {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }
  return undefined;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const sameOrigin = origin === new URL(request.url).origin;
  return {
    // Do not reflect arbitrary Origins while allowing credentials: that turns
    // every authenticated browser into a cross-site admin API client.
    'Access-Control-Allow-Origin': sameOrigin ? origin! : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WP-Nonce, X-Requested-With',
    'Access-Control-Allow-Credentials': sameOrigin ? 'true' : 'false',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export function addCorsHeaders(response: Response, request: Request): Response {
  const newHeaders = new Headers(response.headers);
  const cors = corsHeaders(request);
  Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v as string));
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
