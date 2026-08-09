const express = require('express')
const {verfiyWebHook,receiveMessages} = require('../controllers/whatsappController')
const { handleBunnyWebhook } = require('../controllers/bunnyWebhookController');
const webHookRouter = express.Router()

webHookRouter.get('/webhook', verfiyWebHook)
webHookRouter.post('/webhook', receiveMessages)
webHookRouter.post('/webhooks/bunny', handleBunnyWebhook);
module.exports  = webHookRouter
