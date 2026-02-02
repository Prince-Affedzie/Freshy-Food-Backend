const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  paymentId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },

  // Add package info
  package: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    name: { type: String,  },
    basePrice: { type: Number,  },
    valuePrice: { type: Number }, // optional benchmark
  },

  orderItems: [
    {
      name: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, required: true },
      image: { type: String },
      price: { type: Number, required: true },
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
    }
  ],

  shippingAddress: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String,  },
    nearestLandmark: { type: String },
    phone: { type: String, required: true }
  },

  deliverySchedule: {
    preferredDay: { type: String, required: true },   // e.g., saturday
    preferredTime: { type: String, required: true },  // e.g., afternoon
  },

  deliveryNote: { type: String },

  itemsPrice: { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 0 },
  totalPrice: { type: Number, required: true },

  paymentMethod: { type: String, default:null},
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date },
  isDelivered: { type: Boolean, default: false },
  deliveredAt: { type: Date },

  status: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled']
  },

  // Optional: track if this was a guest → converted user
  wasGuestCheckout: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);