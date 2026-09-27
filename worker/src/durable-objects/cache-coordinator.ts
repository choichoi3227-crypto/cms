/**
 * Serialises site-wide cache invalidation.
 *
 * KV has no atomic prefix delete.  A monotonically increasing generation lets
 * readers immediately stop using every old key without listing the namespace.
 */
export class CacheCoordinator implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/generation') {
      return this.json({ generation: await this.generation() });
    }
    if (request.method === 'POST' && url.pathname === '/purge') {
      const generation = (await this.generation()) + 1;
      await this.state.storage.put('generation', generation);
      return this.json({ generation });
    }
    return new Response('Not Found', { status: 404 });
  }

  private async generation(): Promise<number> {
    return (await this.state.storage.get<number>('generation')) ?? 1;
  }

  private json(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}
