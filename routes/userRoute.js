const {signUp,login,logout,updateUser,deleteAccount,
     markNotificationAsRead,signUpByGoogle,google_login,
    getNotifications,deleteBulkNotification,updatePushToken,deleteNotification,createNotification
} = require('../controllers/userController')
const express = require('express')
const userRoute = express.Router()
const {auth} = require('../middleware/auth');


userRoute.post('/register/account',signUp)
userRoute.post('/login',login)
userRoute.post('/google_sign_up',signUpByGoogle)
userRoute.post('/google_login',google_login)
userRoute.post('/logout',auth,logout)
userRoute.put('/update-account',auth,updateUser)
userRoute.delete('/delete-account',auth,deleteAccount)

userRoute.post('/notifications',auth,createNotification)
userRoute.get('/notifications',auth,getNotifications)
userRoute.put('/mark_notifications/read',auth,markNotificationAsRead)

userRoute.delete('/delete/notification/:Id',auth,deleteNotification)
userRoute.post('/delete/bulk_notification',auth,deleteBulkNotification)

userRoute.post('/user/push-token', auth,updatePushToken )

module.exports = userRoute