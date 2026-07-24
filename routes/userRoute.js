const {signUp,login,logout,updateUser,deleteAccount,
     markNotificationAsRead,signUpByGoogle,google_login,vendor_login,
    getNotifications,deleteBulkNotification,updatePushToken,deleteNotification,createNotification,appleSignUpOrLogin,
} = require('../controllers/userController')
const express = require('express')
const userRoute = express.Router()
const {auth} = require('../middleware/auth');
const { activityLoggerMiddleware } = require('../middleware/activityLoggerMiddleware');


userRoute.post('/register/account',activityLoggerMiddleware('user_registered'),signUp)
userRoute.post('/apple/authenticate',activityLoggerMiddleware('user_logged_in'),appleSignUpOrLogin)
userRoute.post('/login',activityLoggerMiddleware('user_logged_in'),login)
userRoute.post('/vendor/login',activityLoggerMiddleware('vendor_logged_in'),vendor_login)
userRoute.post('/google_sign_up',activityLoggerMiddleware('user_registered'), signUpByGoogle)
userRoute.post('/google_login',activityLoggerMiddleware('user_logged_in'),google_login)
userRoute.post('/logout',activityLoggerMiddleware('user_logged_out'),logout)
userRoute.put('/update-account',auth,updateUser)
userRoute.delete('/delete-account',auth,deleteAccount)

userRoute.post('/notifications',auth,createNotification)
userRoute.get('/notifications',auth,getNotifications)
userRoute.put('/mark_notifications/read',auth,markNotificationAsRead)

userRoute.delete('/delete/notification/:Id',auth,deleteNotification)
userRoute.post('/delete/bulk_notification',auth,deleteBulkNotification)

userRoute.post('/user/push-token', auth,updatePushToken )

module.exports = userRoute