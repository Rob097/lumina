import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePng } from './png.mjs';

// A tiny stand-in for the public widget API + R2 + a static host for the built widget and test-store.
// Same-origin, so the real Origin/CORS gate is irrelevant here — this only exercises the widget flow.
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 5188;
const ORIGIN = `http://localhost:${PORT}`;
const PNG = makePng(160, 120, [120, 140, 180]);

const CONFIG = {
  enabled: true,
  theme: { accent: '#0F62FE', mode: 'light', radius: 16, zIndex: 2147483000 },
  buttonText: 'Try in your room',
  locale: 'en',
  i18n: {},
  watermark: true,
  limits: { anonDailyCap: 5, maxUploadBytes: 10_485_760, maxImageEdgePx: 2048 },
  resultCta: { label: 'Add to cart', urlTemplate: '/cart?add={productId}' },
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-lumina-key,idempotency-key',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, ORIGIN);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (pathname === '/v1/widget/config') return json(res, 200, CONFIG);
  if (pathname === '/v1/widget/sign-upload') {
    return json(res, 200, { uploadUrl: `${ORIGIN}/r2-put/room`, roomKey: 'rooms/m/room.png', expiresIn: 600 });
  }
  if (pathname.startsWith('/r2-put/')) {
    res.writeHead(200, CORS);
    res.end();
    return;
  }
  if (pathname === '/v1/widget/generate') {
    const body = await readBody(req);
    if (String(body.productId ?? '').includes('NOCREDIT')) {
      return json(res, 402, {
        error: { code: 'insufficient_credits', message: 'No credits', requestId: 'req_e2e' },
      });
    }
    return json(res, 201, { generationId: 'gen_e2e', status: 'queued' });
  }
  if (pathname.startsWith('/v1/widget/status/')) {
    return json(res, 200, {
      id: 'gen_e2e',
      status: 'succeeded',
      resultUrl: `${ORIGIN}/fixtures/result.png`,
      beforeUrl: `${ORIGIN}/fixtures/before.png`,
    });
  }
  if (pathname === '/v1/widget/feedback' || pathname === '/v1/widget/event') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (pathname.startsWith('/fixtures/')) {
    res.writeHead(200, { 'content-type': 'image/png', ...CORS });
    res.end(PNG);
    return;
  }

  if (pathname === '/widget.js' || /^\/widget\.[^/]+\.js$/.test(pathname)) {
    try {
      const buf = await readFile(join(dist, pathname.slice(1)));
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end('not built');
    }
    return;
  }

  if (pathname === '/' || pathname === '/test-store.html') {
    const buf = await readFile(join(root, 'test-store.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buf);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`mock widget API + static host on ${ORIGIN}`));
