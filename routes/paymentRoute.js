const {initializePayment,verifyPayment,refundPayment} = require('../controllers/paymentController')
const express = require('express')
const {auth} = require('../middleware/auth');
const paymentRoute = express.Router()

paymentRoute.post('/initialize/payment',initializePayment)
paymentRoute.post('/verify/payment/:reference',auth,verifyPayment)
paymentRoute.put('/refund/payment',refundPayment)

module.exports = paymentRoute