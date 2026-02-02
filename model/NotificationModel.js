const mongoose = require('mongoose')
const schema = mongoose.Schema

const notificationsSchema = new schema({
    user :{
        type : mongoose.Schema.Types.ObjectId,
        ref:'User'
    },
    type:{
        type:String
    },
    title:{
         type:String
    },
    message:{
        type:String
    },
    read:{
        type:Boolean,
        default:false
    }
},{timestamps:true})

const NotificationModel = mongoose.model('Notification',notificationsSchema)
module.exports = {NotificationModel}

