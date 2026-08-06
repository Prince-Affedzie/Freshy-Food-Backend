const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Verification
const verfiyWebHook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
};

// Receive messages
const receiveMessages =  (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
};

module.exports = {verfiyWebHook,receiveMessages}