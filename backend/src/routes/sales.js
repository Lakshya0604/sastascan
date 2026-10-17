const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Sale = require('../models/Sale');
const { mem } = require('../db');
const router = express.Router();

const CATEGORIES = ['Phones & Electronics', 'Kitchen & Utensils', 'Grocery & Daily Needs', 'Fashion & Footwear', 'Furniture', 'Beauty & Personal Care', 'Books & Stationery', 'Other'];

router.get('/categories', (req, res) => res.json(CATEGORIES));

router.get('/', requireAuth, async (req, res) => {
  try {
    const city = String(req.query.city || '').trim();
    const category = String(req.query.category || '').trim();
    if (mem()) {
      let rows = mem().sales.slice();
      if (city) rows = rows.filter(s => s.city.toLowerCase() === city.toLowerCase());
      if (category) rows = rows.filter(s => s.category === category);
      return res.json(rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
    }
    const q = {};
    if (city) q.city = new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    if (category) q.category = category;
    const rows = await Sale.find(q).sort({ createdAt: -1 }).limit(100).lean();
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sales load failed' }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { shopName, address, city, category, items, description, validTill } = req.body || {};
    if (!shopName || !address || !city || !category) return res.status(400).json({ error: 'Shop name, address, city aur category zaroori hai' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Category sahi nahi hai' });
    const cleanItems = (Array.isArray(items) ? items : [])
      .map(i => ({ name: String(i.name || '').trim(), price: Number(i.price), mrp: i.mrp != null ? Number(i.mrp) : undefined }))
      .filter(i => i.name && !isNaN(i.price) && i.price >= 0);
    if (!cleanItems.length) return res.status(400).json({ error: 'Kam se kam ek item aur uska price do' });
    const doc = {
      shopName: String(shopName).trim(), address: String(address).trim(),
      city: String(city).trim(), category, items: cleanItems.slice(0, 30),
      description: String(description || '').trim().slice(0, 500),
      validTill: validTill ? new Date(validTill) : undefined,
      createdBy: req.user.uid
    };
    let saved;
    if (mem()) { saved = { _id: 'm' + mem().id++, ...doc, createdAt: new Date() }; mem().sales.push(saved); }
    else saved = await Sale.create(doc);
    res.json({ ok: true, sale: saved });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Sale add failed' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (mem()) {
      const i = mem().sales.findIndex(s => s._id === req.params.id && s.createdBy === req.user.uid);
      if (i < 0) return res.status(404).json({ error: 'Listing nahi mili' });
      mem().sales.splice(i, 1);
      return res.json({ ok: true });
    }
    const r = await Sale.deleteOne({ _id: req.params.id, createdBy: req.user.uid });
    if (!r.deletedCount) return res.status(404).json({ error: 'Listing nahi mili ya aapki nahi hai' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Delete failed' }); }
});

module.exports = router;
