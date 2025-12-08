const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  slug: { type: String, required: true, unique: true }, 
  category: { type: String, required: true ,enum: ['vegetable', 'fruit', 'staple', 'herb', 'other','tuber'], }, 
  image: { type: String, required: true },
  price: { type: Number, required: true },
  unit: {
     type: String, 
     required: true ,
     enum: ['kg', 'g', 'piece', 'pieces','bunch', 'bag', 'pack','basket','olonka']

  }, 
  cloudinaryId: { type: String },
  
  countInStock: { type: Number, required: true, default: 0 },
  isAvailable: { type: Boolean, default: true },
  description: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', productSchema);