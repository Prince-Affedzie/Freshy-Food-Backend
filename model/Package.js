const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  image: { type: String, required: true },
  cloudinaryId: { type: String },
  description: { type: String, required: true },
  basePrice: { type: Number, required: true }, 
  valuePrice:{type: Number, required: true},
  defaultItems: [
    {
      product: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Product', 
        required: true 
      },
      quantity: { type: Number, required: true } 
    }
  ],
  swapOptions:[
    {
      product: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Product', 
        required: true 
      },
      quantity: { type: Number, required: true } 
    }

  ],
  isActive: { type: Boolean, default: true } 
}, {
  timestamps: true
});

module.exports = mongoose.model('Package', packageSchema);