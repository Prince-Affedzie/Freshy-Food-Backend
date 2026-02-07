const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  slug: { type: String, required: true, unique: true }, 
  category: { type: String, required: true ,
    enum: ['vegetable', 'fruit', 'staple', 'herb', 'other','tuber','grain','cereal','meat','frozen-food','poultry','seafood','spice'],
   }, 
  image: { type: String, required: true },
  price: { type: Number, required: true },
  unit: {
     type: String, 
     required: true ,
     enum: ['kg', 'g', 'piece', 'pieces','bunch', 'bag', 'pack','basket','olonka']

  },
  tags: [
  {
    type: String,
    enum: [
      'featured',
      'best_selling',
      'new_arrival',
      'discounted',
      'popular',
      'seasonal',
      'fresh_today',
      'farm_fresh',
      'organic',
      'locally_sourced',
      'ready_to_cook',
      'ready_to_eat',
      'perishable',
      'non_perishable'
    ]
  }
]

,
  cloudinaryId: { type: String },
  
  countInStock: { type: Number, required: true, default: 0 },
  isAvailable: { type: Boolean, default: true },
  description: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', productSchema);