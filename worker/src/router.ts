/** Minimal dependency-free router for Cloudflare Workers. */
export type IRequest = Request & Record<string, unknown>;
type Handler<Env> = (request: IRequest, env: Env, ctx: ExecutionContext) => Response | void | Promise<Response | void>;

export class Router<Env> {
  private readonly routes: Array<{ method: string; pattern: string; handlers: Handler<Env>[] }> = [];

  get(pattern: string, ...handlers: Handler<Env>[]) { return this.add('GET', pattern, handlers); }
  post(pattern: string, ...handlers: Handler<Env>[]) { return this.add('POST', pattern, handlers); }
  options(pattern: string, ...handlers: Handler<Env>[]) { return this.add('OPTIONS', pattern, handlers); }
  all(pattern: string, ...handlers: Handler<Env>[]) { return this.add('*', pattern, handlers); }

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | undefined> {
    const routed = request as IRequest;
    const path = new URL(request.url).pathname;
    for (const route of this.routes) {
      if ((route.method === '*' || route.method === request.method) && matches(route.pattern, path)) {
        for (const handler of route.handlers) {
          const response = await handler(routed, env, ctx);
          if (response) return response;
        }
      }
    }
    return undefined;
  }

  private add(method: string, pattern: string, handlers: Handler<Env>[]) {
    this.routes.push({ method, pattern, handlers });
    return this;
  }
}

function matches(pattern: string, path: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}
