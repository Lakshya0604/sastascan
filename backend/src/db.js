const mongoose = require('mongoose');

let memory = null; // dev fallback when no MONGODB_URI

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[db] MONGODB_URI not set - using in-memory dev store (data lost on restart)');
    memory = { products: new Map(), prices: new Map(), sales: [], users: new Map(), id: 1 };
    return;
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('[db] MongoDB connected');
}

function mem() { return memory; }
module.exports = { connect, mem };
