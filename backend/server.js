require('./src/db').connect();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '2mb' }));

const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  }
}));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api', require('./src/routes/scan'));
app.use('/api/sales', require('./src/routes/sales'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('SastaScan backend on :' + PORT));
