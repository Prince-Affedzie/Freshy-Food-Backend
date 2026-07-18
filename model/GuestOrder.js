const mongoose = require('mongoose');

const guestOrderSchema = new mongoose.Schema({
    product :{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"Product"

    },
    productName:{
        type: String,
        reqired:true,
        
    },
    price:{
        type: Number
    },
    cutomerName:{
        type: String
    },
    phone:{
        type:String
    },
    campus:{
        type: String
    },
    location:{
        type:String
    },
    status: {
    type: String,
    enum: ['pending', 'contacted', 'completed', 'cancelled'],
    default: 'pending',
  },
  vendor:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Vendor'
  },

})
module.exports = mongoose.model("GuestOrder", guestOrderSchema)