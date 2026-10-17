const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function sign(user) {
  return jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, login again' });
  }
}
module.exports = { sign, requireAuth };
