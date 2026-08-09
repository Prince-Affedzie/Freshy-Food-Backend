const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const { handleIncomingMessage } = require('../services/waConversation');
const { isDuplicate } = require('../lib/waDedupe');
const wa = require('../lib/whatsappClient');

// Verification (unchanged from what you had)
const verfiyWebHook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
};

// Receive messages
const receiveMessages = (req, res) => {
  // Ack immediately. Meta retries aggressively (and duplicates the delivery)
  // if it doesn't get a fast 200, so we respond first and do the real work
  // afterwards rather than awaiting it inline.
  res.sendStatus(200);

  const entry = req.body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];

  if (!message) return; // delivery/read status update or other event — nothing to do

  processMessage(message).catch((err) => {
    console.error('WhatsApp message handling error:', err);
  });
};

async function processMessage(message) {
  if (await isDuplicate(message.id)) return;

  const from = message.from;
  await wa.markAsRead(message.id);
  await handleIncomingMessage(from, message);
}

module.exports = { verfiyWebHook, receiveMessages };