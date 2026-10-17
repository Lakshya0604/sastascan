// Price fetching + same-product matching. Real data only: every offer carries the
// merchant and price Google Shopping (India) showed, fetched via Searlo.
// "exact" = title strongly matches the identified product. "maybe" = similar.
const { PriceCache } = require('../models/Cache');
const { mem } = require('../db');
const searlo = require('./searlo');

const STOP = new Set(['the','a','an','of','for','and','or','with','pack','pcs','pc','gm','g','kg','ml','l','ltr','litre','new','best','buy','online','price','in','india','at','rs','-','|',':','(',')']);
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t));
}
function matchScore(identityTitle, offerTitle, brand) {
  const a = new Set(tokens(identityTitle));
  if (brand) tokens(brand).forEach(t => a.add(t));
  if (!a.size) return 0;
  const b = new Set(tokens(offerTitle));
  let hit = 0;
  a.forEach(t => { if (b.has(t)) hit++; });
  return hit / a.size;
}
function parseInr(priceStr) {
  if (!priceStr) return null;
  const m = String(priceStr).replace(/[₹,\s]/g, '');
  const n = parseFloat(m);
  return isNaN(n) ? null : n;
}

// Known Indian stores -> direct on-site search URL (always a real store page).
const STORES = [
  [/amazon\.in|amazon/i, q => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`],
  [/flipkart/i, q => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`],
  [/croma/i, q => `https://www.croma.com/searchB?q=${encodeURIComponent(q)}`],
  [/reliance ?digital/i, q => `https://www.reliancedigital.in/search?q=${encodeURIComponent(q)}`],
  [/vijay ?sales/i, q => `https://www.vijaysales.com/search-listing?q=${encodeURIComponent(q)}`],
  [/jiomart/i, q => `https://www.jiomart.com/search/${encodeURIComponent(q)}`],
  [/bigbasket/i, q => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}`],
  [/blinkit|grofers/i, q => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`],
  [/meesho/i, q => `https://www.meesho.com/search?q=${encodeURIComponent(q)}`],
  [/tatacliq|tata ?cliq/i, q => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(q)}`],
  [/snapdeal/i, q => `https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}`],
  [/myntra/i, q => `https://www.myntra.com/${encodeURIComponent(q)}`],
  [/ajio/i, q => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}`],
  [/nykaa/i, q => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`],
  [/firstcry/i, q => `https://www.firstcry.com/search?q=${encodeURIComponent(q)}`],
  [/1mg|tata ?1mg/i, q => `https://www.1mg.com/search/all?name=${encodeURIComponent(q)}`],
  [/pharmeasy/i, q => `https://pharmeasy.in/search/all?name=${encodeURIComponent(q)}`]
];
function storeSearchUrl(merchant, title) {
  for (const [re, fn] of STORES) if (re.test(merchant || '')) return fn(title);
  return null;
}


function sizeKey(s) {
  const m = String(s || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kilograms?|kgs?|grams?|gms?|g|ml\.?|ltr\.?|litres?|l)\b/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const u = m[2];
  if (u.startsWith('k') || u.startsWith('l')) v *= 1000;
  return (u.startsWith('k') || u === 'gm' || u === 'gms' || u.startsWith('gram') || u === 'g') ? 'w' + v : 'v' + v;
}

async function cachedGet(key) {
  if (mem()) return mem().prices.get(key) || null;
  const row = await PriceCache.findOne({ key }).lean();
  return row ? { exact: row.exact, maybe: row.maybe } : null;
}
async function cachedSet(key, val) {
  if (mem()) { mem().prices.set(key, val); return; }
  await PriceCache.updateOne({ key }, { $set: { exact: val.exact, maybe: val.maybe, createdAt: new Date() } }, { upsert: true });
}

async function fetchPrices(identity, barcode, { approximate = false, queryOverride = null } = {}) {
  const cacheKey = approximate ? 'q:' + (queryOverride || '') : 'b:' + barcode;
  const hit = await cachedGet(cacheKey);
  if (hit) return { ...hit, cached: true };

  if (!searlo.hasKey()) return { exact: [], maybe: [], error: 'price_api_unconfigured' };

  const queries = [];
  if (!approximate && barcode) queries.push(String(barcode));
  let q = queryOverride;
  if (!q && identity) {
    q = identity.title || '';
    if (identity.brand && !q.toLowerCase().includes(identity.brand.toLowerCase())) q = identity.brand + ' ' + q;
    if (identity.size && !q.toLowerCase().includes(String(identity.size).toLowerCase().replace(/\s+/g, ''))) q += ' ' + identity.size;
  }
  q = (q || '').trim();
  if (q) queries.push(q);
  const settled = await Promise.allSettled(queries.map(async (query) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await searlo.shoppingIndia(query, 30); }
      catch (e) {
        if (e.code === 'RETRYABLE') { await new Promise(r => setTimeout(r, 2500)); continue; }
        throw e;
      }
    }
  }));
  let raw = [];
  let lastErr = null;
  for (const r of settled) {
    if (r.status === 'fulfilled') raw = raw.concat(r.value);
    else lastErr = r.reason;
  }
  if (!raw.length && lastErr) {
    return { exact: [], maybe: [], error: lastErr.code === 'QUOTA' ? 'quota' : 'fetch_failed' };
  }

  const seen = new Set();
  const exact = [], maybe = [];
  const ACC = /\b(covers?|cases?|skins?|wraps?|tempered|guard|protector|charger|cable|earphones?|headphones?|adapter|screen ?guard|back ?panel|flip ?cover|pouch|sleeve|housings?|modules?|batteries|straps?|bands?)\b/i;
  const wantsAccessory = ACC.test(q || '');
  for (const r of raw) {
    const price = parseInr(r.price);
    if (price == null) continue; // skip offers with unreadable price
    const merchant = r.merchant || null;
    const dedupeK = (merchant || '') + '|' + price + '|' + (r.title || '').slice(0, 40).toLowerCase();
    if (seen.has(dedupeK)) continue;
    seen.add(dedupeK);
    const offer = {
      title: r.title || '',
      price,
      priceText: r.price,
      merchant,
      shipping: r.shipping || null,
      returns: r.returns || null,
      rating: r.rating || null,
      ratingCount: r.ratingCount || null,
      thumbnail: r.thumbnail || null,
      storeUrl: storeSearchUrl(merchant, (identity && identity.title) || r.title),
      googleLink: r.link || null
    };
    if (approximate && !wantsAccessory && ACC.test(r.title || '')) continue; // phone query -> skip covers/skins
    if (approximate) { maybe.push(offer); continue; }
    let score = matchScore(identity ? identity.title : '', r.title, identity && identity.brand);
    // Size/qty mismatch (e.g. 45gm pack vs 200g) means a different product variant.
    const aSize = sizeKey(identity && (identity.size || identity.title));
    const bSize = sizeKey(r.title);
    if (aSize && bSize && aSize !== bSize) score = Math.min(score, 0.5);
    (score >= 0.65 ? exact : maybe).push(offer);
  }
  exact.sort((a, b) => a.price - b.price);
  maybe.sort((a, b) => a.price - b.price);
  const out = { exact: exact.slice(0, 15), maybe: maybe.slice(0, 15) };
  await cachedSet(cacheKey, out);
  return { ...out, cached: false };
}

module.exports = { fetchPrices, matchScore, tokens };
