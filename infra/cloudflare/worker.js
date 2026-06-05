/**
 * lumina-widget-cdn — serves widget bundles from R2 with immutable caching + permissive CORS so the
 * loader can be embedded on any merchant storefront. Static, dependency-free. Wrangler config in
 * wrangler.toml. (Deployed during the deploy session — see infra/README.md.)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\/+/, ''); // e.g. "widget.js" or "widget.<hash>.js"

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const object = await env.CDN.get(key);
    if (!object) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', env.CACHE_CONTROL ?? 'public, max-age=31536000, immutable');
    headers.set('content-type', 'application/javascript; charset=utf-8');
    headers.set('access-control-allow-origin', '*');

    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  },
};
