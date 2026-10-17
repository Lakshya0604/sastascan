// Searlo API client (Google Shopping India + web search for barcode identity).
// Docs: https://searlo.tech/docs (GET /api/v1/search/shopping, x-api-key header)
const BASE = 'https://api.searlo.tech/api/v1';

function key() { return process.env.SEARLO_API_KEY || ''; }

async function searloGet(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-api-key': key() }, signal: AbortSignal.timeout(15000) });
  if (res.status === 429) { const e = new Error('Searlo quota/rate limit'); e.code = 'QUOTA'; throw e; }
  if (res.status === 503) { const e = new Error('Searlo temporarily blocked upstream'); e.code = 'RETRYABLE'; throw e; }
  if (!res.ok) { const e = new Error('Searlo HTTP ' + res.status); e.code = 'HTTP'; throw e; }
  return res.json();
}

// Google Shopping results for India. Returns [{title, price, source, link, ...}]
async function shoppingIndia(q, limit = 30) {
  const data = await searloGet('/search/shopping', { q, limit, gl: 'in', hl: 'en' });
  return Array.isArray(data.shopping) ? data.shopping : [];
}

// Web search - used to identify a product by its barcode number.
async function webSearch(q, limit = 5) {
  const data = await searloGet('/search/web', { q, limit, gl: 'in', hl: 'en' });
  return Array.isArray(data.organic) ? data.organic : [];
}

module.exports = { shoppingIndia, webSearch, hasKey: () => !!key() };
