/*
 * Thin integration layer between the WhatsApp bot and the rest of
 * CediMart. The goal is to reuse your existing logic, not duplicate it —
 * most of the TODOs below should just call the same model/service
 * functions your Express routes already use.
 */
const axios = require('axios');

const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE_URL || 'http://localhost:5000';

// Reuses your existing AI search endpoint — the same one the app and web use.
async function searchProducts(query) {
  const { data } = await axios.post(`${INTERNAL_API_BASE}/api/ai/search`, { query });
  return data; // { success, query, aiResponse, count, results }
}

// TODO: point this at however you fetch a single product by id today.
async function getProductById(productId) {
  const { data } = await axios.get(`${INTERNAL_API_BASE}/api/products/${productId}`);
  return data?.product || data;
}

// TODO: replace with your real User model/service. Should look up a user
// by phone number and return null (not throw) if none exists.
async function findUserByPhone(phone) {
  // const User = require('../models/User');
  // return User.findOne({ phone });
  throw new Error('findUserByPhone not implemented — wire this to your User model.');
}

// TODO: replace with your real User model/service. Tag the account with
// its origin so you can tell WhatsApp-created accounts apart later.
async function createUser({ phone, name, campus }) {
  // const User = require('../models/User');
  // return User.create({ phone, name, campus, source: 'whatsapp' });
  throw new Error('createUser not implemented — wire this to your User model.');
}

// TODO: replace with your real Order model/service.
async function createOrder({ userId, productId, quantity }) {
  // const Order = require('../models/Order');
  // const product = await getProductById(productId);
  // return Order.create({
  //   user: userId,
  //   items: [{ product: productId, quantity, price: product.price }],
  //   totalAmount: product.price * quantity,
  //   channel: 'whatsapp',
  //   status: 'pending',
  // });
  throw new Error('createOrder not implemented — wire this to your Order model.');
}

module.exports = { searchProducts, getProductById, findUserByPhone, createUser, createOrder };