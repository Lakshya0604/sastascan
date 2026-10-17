// Barcode -> product identity. Waterfall of free sources, each result cached in Mongo.
// Only real data: every identity carries which source gave it.
const { ProductCache } = require('../models/Cache');
const { mem } = require('../db');
const searlo = require('./searlo');

const UA = { 'User-Agent': 'SastaScan/1.0 (price comparison app; contact: lakshyayaduvanshi28@gmail.com)' };

async function jget(url, timeoutMs = 12000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

function fromOFF(data, source) {
  const p = data && data.product;
  if (!data || data.status !== 1 || !p || !p.product_name) return null;
  return {
    barcode: data.code,
    title: p.product_name.trim(),
    brand: (p.brands || '').split(',')[0].trim() || null,
    size: p.quantity || null,
    image: p.image_front_url || p.image_url || null,
    category: 'Food & Grocery',
    source
  };
}

async function tryOpenFoodFacts(barcode) {
  try {
    const d = await jget(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,quantity,image_front_url,image_url`);
    return fromOFF(d, 'Open Food Facts');
  } catch (e) { return null; }
}
async function tryOpenBeautyFacts(barcode) {
  try {
    const d = await jget(`https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,quantity,image_front_url,image_url`);
    return fromOFF(d, 'Open Beauty Facts');
  } catch (e) { return null; }
}
async function tryUpcItemDb(barcode) {
  try {
    const d = await jget(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
    const it = d && d.items && d.items[0];
    if (!it || !it.title) return null;
    return {
      barcode: it.ean || barcode,
      title: it.title.trim(),
      brand: it.brand || null,
      size: it.size || null,
      image: (it.images && it.images[0]) || null,
      category: it.category ? it.category.split('>')[0].trim() : null,
      model: it.model || null,
      source: 'UPCitemdb'
    };
  } catch (e) { return null; }
}
async function tryOpenLibrary(barcode) {
  if (!/^(97[89])\d{10}$/.test(barcode)) return null; // ISBN-13 only
  try {
    const d = await jget(`https://openlibrary.org/api/books?bibkeys=ISBN:${barcode}&format=json&jscmd=data`);
    const b = d['ISBN:' + barcode];
    if (!b || !b.title) return null;
    return {
      barcode,
      title: b.title,
      brand: (b.authors && b.authors[0] && b.authors[0].name) || null,
      size: null,
      image: (b.cover && (b.cover.medium || b.cover.large)) || null,
      category: 'Books',
      source: 'Open Library'
    };
  } catch (e) { return null; }
}
// Last resort: search the raw barcode on Google (via Searlo). Many Indian product
// pages are indexed by EAN. Marked lower confidence - title comes from a search snippet.
async function tryBarcodeWebSearch(barcode) {
  if (!searlo.hasKey()) return null;
  try {
    const hits = await searlo.webSearch(barcode, 5);
    if (!hits.length) return null;
    const t = hits[0].title || '';
    // Heuristic: skip pure directory/gtin-info pages
    if (/barcode|gtin|ean[- ]?13|upc[- ]?lookup/i.test(t) && hits[1]) {
      return { barcode, title: hits[1].title.trim(), brand: null, size: null, image: null, category: null, source: 'Google search (barcode)', lowConfidence: true };
    }
    return { barcode, title: t.trim(), brand: null, size: null, image: null, category: null, source: 'Google search (barcode)', lowConfidence: true };
  } catch (e) { return null; }
}

async function getCached(barcode) {
  if (mem()) return mem().products.get(barcode) || null;
  const row = await ProductCache.findOne({ barcode }).lean();
  return row ? row.identity : null;
}
async function setCached(barcode, identity) {
  if (mem()) { mem().products.set(barcode, identity); return; }
  await ProductCache.updateOne({ barcode }, { $set: { identity } }, { upsert: true });
}

async function identify(barcode) {
  barcode = String(barcode).trim();
  if (!/^\d{8,14}$/.test(barcode)) {
    return { identity: null, reason: 'invalid_barcode' };
  }
  const cached = await getCached(barcode);
  if (cached) return { identity: cached, cached: true };
  const identity =
    (await tryOpenFoodFacts(barcode)) ||
    (await tryOpenBeautyFacts(barcode)) ||
    (await tryUpcItemDb(barcode)) ||
    (await tryOpenLibrary(barcode)) ||
    (await tryBarcodeWebSearch(barcode));
  if (identity) await setCached(barcode, identity);
  return { identity, cached: false };
}

module.exports = { identify };
