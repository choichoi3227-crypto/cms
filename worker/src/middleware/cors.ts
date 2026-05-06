import { IRequest } from 'itty-router';

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
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WP-Nonce, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
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
