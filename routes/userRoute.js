const {signUp,login,logout,updateUser,deleteAccount,
     markNotificationAsRead,signUpByGoogle,google_login,vendor_login,
    getNotifications,deleteBulkNotification,updatePushToken,deleteNotification,createNotification,
    appleSignUpOrLogin,followUser,getFollowers,getFollowing,getMyFollowingIds,
} = require('../controllers/userController')
const express = require('express')
const userRoute = express.Router()
const {auth} = require('../middleware/auth');
const { activityLoggerMiddleware } = require('../middleware/activityLoggerMiddleware');
const  rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });


userRoute.post('/register/account',activityLoggerMiddleware('user_registered'),signUp)
userRoute.post('/apple/authenticate',activityLoggerMiddleware('user_logged_in'),authLimiter, appleSignUpOrLogin)
userRoute.post('/login',activityLoggerMiddleware('user_logged_in'),authLimiter,login)
userRoute.post('/vendor/login',activityLoggerMiddleware('vendor_logged_in'),authLimiter,vendor_login)
userRoute.post('/google_sign_up',activityLoggerMiddleware('user_registered'), signUpByGoogle)
userRoute.post('/google_login',activityLoggerMiddleware('user_logged_in'),authLimiter,google_login)
userRoute.post('/logout',activityLoggerMiddleware('user_logged_out'),logout)
userRoute.put('/update-account',auth,updateUser)
userRoute.delete('/delete-account',auth,deleteAccount)

userRoute.post('/notifications',auth,createNotification)
userRoute.get('/notifications',auth,getNotifications)
userRoute.put('/mark_notifications/read',auth,markNotificationAsRead)

userRoute.delete('/delete/notification/:Id',auth,deleteNotification)
userRoute.post('/delete/bulk_notification',auth,deleteBulkNotification)

userRoute.post('/user/push-token', auth,updatePushToken )

userRoute.post('/users/:id/follow', auth, followUser);
userRoute.get('/users/:id/followers', auth, getFollowers);
userRoute.get('/users/:id/following', auth, getFollowing);
userRoute.get('/users/me/following-ids',auth,getMyFollowingIds)

module.exports = userRoute