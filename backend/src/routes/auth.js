const express = require('express');
const bcrypt = require('bcryptjs');
const { sign, requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { mem } = require('../db');
const router = express.Router();

async function findUserByEmail(email) {
  if (mem()) return mem().users.get(email) || null;
  return User.findOne({ email });
}
async function createUser(doc) {
  if (mem()) {
    const u = { _id: String(mem().id++), ...doc };
    mem().users.set(doc.email, u);
    return u;
  }
  return User.create(doc);
}

router.post('/signup', async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email aur password zaroori hai' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye' });
    email = String(email).toLowerCase().trim();
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'Ye email pehle se registered hai, login karo' });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await createUser({ name: String(name).trim(), email, passwordHash });
    res.json({ token: sign(user), user: { name: user.name, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Signup failed' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email aur password do' });
    const user = await findUserByEmail(String(email).toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Galat email ya password' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Galat email ya password' });
    res.json({ token: sign(user), user: { name: user.name, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ email: req.user.email });
});

module.exports = router;
