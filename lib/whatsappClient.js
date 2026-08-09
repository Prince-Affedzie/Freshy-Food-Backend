const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // long-lived system-user token, not the 24h quick-start token
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function send(payload) {
  try {
    const { data } = await client.post('', { messaging_product: 'whatsapp', ...payload });
    return data;
  } catch (err) {
    console.error('WhatsApp send error:', err?.response?.data || err.message);
    throw err;
  }
}

function sendText(to, body, previewUrl = false) {
  return send({ to, type: 'text', text: { body, preview_url: previewUrl } });
}

// `link` must be a publicly reachable https URL — your Supabase product
// image URLs work fine here, no upload step needed.
function sendImage(to, link, caption) {
  return send({ to, type: 'image', image: { link, caption } });
}

// Up to 3 quick-reply buttons. Each: { id, title } — title max 20 chars.
function sendButtons(to, bodyText, buttons, footer) {
  return send({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

// sections: [{ title, rows: [{ id, title, description }] }] — max 10 rows total,
// row title max 24 chars, description max 72 chars (auto-truncated below).
function sendList(to, bodyText, buttonLabel, sections, headerText, footerText) {
  return send({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: headerText ? { type: 'text', text: headerText } : undefined,
      body: { text: bodyText },
      footer: footerText ? { text: footerText } : undefined,
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: (r.description || '').slice(0, 72),
          })),
        })),
      },
    },
  });
}

async function markAsRead(messageId) {
  try {
    await client.post('', { messaging_product: 'whatsapp', status: 'read', message_id: messageId });
  } catch (err) {
    console.error('WhatsApp mark-as-read error:', err?.response?.data || err.message);
  }
}

module.exports = { sendText, sendImage, sendButtons, sendList, markAsRead };