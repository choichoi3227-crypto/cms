import { IRequest } from 'itty-router';
import { Env } from '../types/env';
import { createGithubStorage } from '../utils/github';

export async function handleMedia(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/wp-content/uploads/', '');

  // Try GitHub first
  const github = await createGithubStorage(env.DB, env.OPTIONS);
  if (github) {
    const data = await github.readFileRaw(`wp-content/uploads/${path}`);
    if (data) {
      const mimeType = getMimeType(path);
      return new Response(data, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Try KV cache
  const kvKey = `media:${path}`;
  const cached = await env.CACHE.get(kvKey, 'text');
  if (cached) {
    const binary = atob(cached);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': getMimeType(path),
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}

export async function handlePluginProxy(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Try GitHub storage for plugin/theme assets
  const github = await createGithubStorage(env.DB, env.OPTIONS);
  if (github) {
    const repoPath = path.replace(/^\//, '');
    const data = await github.readFileRaw(repoPath);
    if (data) {
      const mimeType = getMimeType(path);
      return new Response(data, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Return empty for CSS/JS to avoid 404 errors breaking the admin
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'css') return new Response('/* CF-WP Plugin Asset */', { headers: { 'Content-Type': 'text/css' } });
  if (ext === 'js') return new Response('/* CF-WP Plugin Asset */', { headers: { 'Content-Type': 'application/javascript' } });
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'svg') {
    // Return a 1x1 transparent pixel
    const pixel = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const bytes = Uint8Array.from(atob(pixel), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': ext === 'svg' ? 'image/svg+xml' : 'image/gif' } });
  }

  return new Response('Not Found', { status: 404 });
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'ico': 'image/x-icon', 'avif': 'image/avif', 'bmp': 'image/bmp',
    'css': 'text/css', 'js': 'application/javascript', 'mjs': 'application/javascript',
    'json': 'application/json', 'xml': 'application/xml',
    'pdf': 'application/pdf', 'zip': 'application/zip',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav',
    'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'html': 'text/html', 'htm': 'text/html', 'txt': 'text/plain',
    'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return types[ext] || 'application/octet-stream';
}
