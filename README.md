# SastaScan

Scan kisi bhi product ka barcode ya QR - exact same product ke online prices (India), sabse sasta upar, har result pe store ka link. Photo se bhi rough price idea (similar products, clearly labelled). Plus: apne sheher ki local shop sales, category-wise.

## Stack
- `frontend/` - static PWA (Firebase Hosting). html5-qrcode (barcode+QR), Tesseract.js (photo OCR).
- `backend/` - Node/Express API (Render). MongoDB Atlas (auth, caches, sales).

## Data sources (all free)
- Product identity: Open Food Facts, Open Beauty Facts, UPCitemdb trial, Open Library, Google barcode search (via Searlo)
- Prices: Google Shopping India via Searlo API (1 credit/query, cached 12h)
- City sales: shop-owner submitted listings (real data only - no fake entries)

## Honesty rules (by design)
- Barcode/QR results: only strong title+size matches are shown as "same product"; weaker matches are labelled "shayad same".
- Photo/name search: everything is labelled approximate/similar.
- No price is ever invented; unverifiable results are excluded.

## Env (backend)
`MONGODB_URI`, `SEARLO_API_KEY`, `JWT_SECRET`, `ALLOWED_ORIGINS`

## Run locally
```bash
cd backend && npm install && npm start   # :4000
# serve frontend/ statically, set API URL in frontend/app.js if different
```
