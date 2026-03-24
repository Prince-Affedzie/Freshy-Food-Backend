const buildOrderSMS = (user, order) => {
  const orderNumber = order._id.toString().slice(-8).toUpperCase();

  return `Hi ${user.firstName}, your order ${orderNumber} has been received. Total: GHS ${order.totalPrice}. We'll notify you when it's on the way. - FreshyFoods`;
};

module.exports = { buildOrderSMS };