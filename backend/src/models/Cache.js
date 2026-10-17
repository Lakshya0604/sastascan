const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
  barcode: { type: String, unique: true, index: true },
  identity: Object,
  createdAt: { type: Date, default: Date.now }
});
const priceSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true }, // barcode or query string
  exact: [Object],
  maybe: [Object],
  createdAt: { type: Date, default: Date.now, expires: 43200 } // 12h TTL
});
module.exports = {
  ProductCache: mongoose.models.ProductCache || mongoose.model('ProductCache', productSchema),
  PriceCache: mongoose.models.PriceCache || mongoose.model('PriceCache', priceSchema)
};
