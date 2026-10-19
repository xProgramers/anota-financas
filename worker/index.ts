// Worker da Cloudflare: os arquivos do front (dist/) são servidos direto pelos assets;
// só /api/* chega aqui. As variáveis e secrets do Worker aparecem em process.env.
import { GET, POST } from '../api/ai/interpret.js';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

async function route(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/ai/interpret') {
    if (request.method === 'POST') return POST(request);
    return GET();
  }
  return new Response(JSON.stringify({ error: 'Não encontrado.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await route(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
