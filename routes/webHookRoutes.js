const express = require('express')
const {verfiyWebHook,receiveMessages} = require('../controllers/webHookController')
const webHookRouter = express.Router()

webHookRouter.get('/webhook', verfiyWebHook)
webHookRouter.post('/webhook', receiveMessages)
module.exports  = webHookRouter
