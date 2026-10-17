const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, min: 0 }
}, { _id: false });
const schema = new mongoose.Schema({
  shopName: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true, index: true },
  category: { type: String, required: true, index: true },
  items: { type: [itemSchema], validate: v => v.length > 0 },
  description: { type: String, trim: true, default: '' },
  validTill: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.models.Sale || mongoose.model('Sale', schema);
