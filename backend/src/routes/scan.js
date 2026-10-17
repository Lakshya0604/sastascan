const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { identify } = require('../services/identify');
const { fetchPrices } = require('../services/prices');
const searlo = require('../services/searlo');
const router = express.Router();

// Barcode/QR scan -> identity + prices. Exact-match rule: only strongly matched
// offers are presented as "same product"; the rest are labelled "shayad same".
router.get('/scan/:barcode', requireAuth, async (req, res) => {
  try {
    const { identity, cached } = await identify(req.params.barcode);
    if (!identity) {
      return res.json({
        found: false,
        message: 'Ye barcode free databases mein nahi mila. Naam likh ke search karo ya photo try karo.'
      });
    }
    const prices = await fetchPrices(identity, req.params.barcode);
    res.json({ found: true, identity, identityCached: !!cached, ...prices });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Scan failed, try again' }); }
});

// Text search (manual name or photo-detected name). Everything here is
// approximate by design - labelled "similar products", never exact.
router.post('/search', requireAuth, async (req, res) => {
  try {
    const q = String((req.body || {}).query || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'Product ka naam likho' });
    const prices = await fetchPrices(null, null, { approximate: true, queryOverride: q });
    res.json({ found: true, approximate: true, query: q, ...prices });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Search failed, try again' }); }
});

// Resolve the best direct store link on demand (1 Searlo credit per click, cached).
// Falls back to the store's own search page, then the Google Shopping link.
const linkCache = new Map();
router.get('/go', requireAuth, async (req, res) => {
  try {
    const { merchant, title, storeUrl, googleLink } = req.query;
    const t = String(title || '').slice(0, 150);
    const m = String(merchant || '').slice(0, 60);
    const ck = m + '|' + t;
    if (linkCache.has(ck)) return res.json({ url: linkCache.get(ck) });
    let url = null;
    if (searlo.hasKey() && m && t) {
      try {
        const hits = await searlo.webSearch(`${m} ${t}`, 5);
        const want = m.toLowerCase().replace(/[^a-z0-9]/g, '');
        const good = hits.find(h => h.link && h.link.toLowerCase().replace(/[^a-z0-9]/g, '').includes(want));
        if (good) url = good.link;
      } catch (e) { /* fall through to fallbacks */ }
    }
    if (!url) url = storeUrl || googleLink || null;
    if (!url) return res.status(404).json({ error: 'Link nahi mila' });
    linkCache.set(ck, url);
    res.json({ url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Link resolve failed' }); }
});

module.exports = router;
