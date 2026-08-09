const wa = require('../lib/whatsappClient');
const { getSession, saveSession, resetSession } = require('../lib/waSession');
const cedimart = require('./cedimartApi');

const CAMPUS_OPTIONS = [
  { id: 'campus_UG', title: 'University of Ghana' },
  { id: 'campus_KNUST', title: 'KNUST' },
  { id: 'campus_UCC', title: 'Univ. of Cape Coast' },
  { id: 'campus_UEW', title: 'UEW' },
  { id: 'campus_OTHER', title: 'Other' },
];

function formatGHS(amount) {
  return `GHS ${Number(amount).toLocaleString('en-GH')}`;
}

// Normalizes the raw WhatsApp webhook message into { type, text, replyId }.
function parseIncoming(message) {
  if (message.type === 'text') {
    return { type: 'text', text: message.text.body.trim() };
  }
  if (message.type === 'interactive') {
    const interactive = message.interactive;
    if (interactive.type === 'button_reply') {
      return { type: 'reply', replyId: interactive.button_reply.id, text: interactive.button_reply.title };
    }
    if (interactive.type === 'list_reply') {
      return { type: 'reply', replyId: interactive.list_reply.id, text: interactive.list_reply.title };
    }
  }
  return { type: 'unsupported' };
}

async function sendMainMenu(to, greetName) {
  await wa.sendButtons(
    to,
    greetName
      ? `Welcome back, ${greetName}! What would you like to do?`
      : "Hi! I'm CediAi, your CediMart shopping assistant. What would you like to do?",
    [
      { id: 'menu_search', title: '🔍 Find a product' },
      { id: 'menu_orders', title: '📦 My orders' },
      { id: 'menu_help', title: '❓ Help' },
    ]
  );
}

// ── Onboarding (account creation right in the chat) ─────────────────────────

async function startOnboarding(to, session, resume) {
  session.step = 'onboarding_name';
  session.data.resumeAfterOnboarding = resume || null;
  await saveSession(to, session);
  await wa.sendText(to, "Let's get you set up — takes 10 seconds. What's your name?");
}

async function handleOnboardingName(to, session, text) {
  session.data.pendingName = text.trim().slice(0, 60);
  session.step = 'onboarding_campus';
  await saveSession(to, session);
  await wa.sendList(
    to,
    'Nice to meet you. Which campus are you on?',
    'Choose campus',
    [{ title: 'Campus', rows: CAMPUS_OPTIONS.map((c) => ({ id: c.id, title: c.title })) }]
  );
}

async function handleOnboardingCampus(to, session, replyId) {
  const campus = replyId.replace('campus_', '');

  try {
    const user = await cedimart.createUser({ phone: to, name: session.data.pendingName, campus });
    session.data.userId = user._id || user.id;
    session.data.name = session.data.pendingName;
    session.data.campus = campus;
  } catch (err) {
    console.error('WA account creation failed:', err.message);
    await wa.sendText(to, "Something went wrong creating your account. Send 'hi' to try again.");
    await resetSession(to);
    return;
  }

  await wa.sendText(to, `You're all set, ${session.data.name} 🎉`);

  const resume = session.data.resumeAfterOnboarding;
  session.data.resumeAfterOnboarding = null;

  if (resume?.action === 'order' && resume.product) {
    session.step = 'awaiting_quantity';
    session.data.pendingOrder = resume.product;
    await saveSession(to, session);
    await wa.sendText(to, `How many "${resume.product.name}" would you like? Reply with a number.`);
    return;
  }

  session.step = 'idle';
  await saveSession(to, session);
  await sendMainMenu(to, session.data.name);
}

// ── Search & browse ──────────────────────────────────────────────────────

async function handleSearch(to, session, query) {
  await wa.sendText(to, 'Let me look that up… 🔎');

  let result;
  try {
    result = await cedimart.searchProducts(query);
  } catch (err) {
    console.error('WA search failed:', err.message);
    await wa.sendText(to, "Ask Cedi couldn't reach the search service just now — please try again shortly.");
    return;
  }

  if (!result?.results?.length) {
    await wa.sendText(to, 'No matches for that right now. Try a different product, budget, or campus.');
    return;
  }

  // The bullet lines in aiResponse duplicate the list below, so strip them
  // out and just send the AI's framing text.
  const introText = (result.aiResponse || '')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('✨'))
    .join(' ')
    .trim();

  if (introText) await wa.sendText(to, introText);

  // Cache the shown results in-session so a later list/button tap can
  // resolve straight back to product data without another DB round trip.
  session.data.lastResults = result.results.slice(0, 10).reduce((map, p) => {
    map[p._id] = {
      id: p._id,
      name: p.name,
      price: p.price,
      image: p.images?.[0],
      condition: p.condition,
      campus: p.campus,
    };
    return map;
  }, {});
  session.step = 'idle';
  await saveSession(to, session);

  await wa.sendList(
    to,
    `Found ${result.results.length} match${result.results.length > 1 ? 'es' : ''} — tap one to see details.`,
    'View results',
    [{
      title: 'Results',
      rows: result.results.slice(0, 10).map((p) => ({
        id: `product_${p._id}`,
        title: p.name,
        description: `${formatGHS(p.price)} · ${p.condition} · ${p.campus}`,
      })),
    }]
  );
}

async function showProductDetail(to, session, productId) {
  const cached = session.data.lastResults?.[productId];
  if (!cached) {
    await wa.sendText(to, 'That listing expired from this chat — try searching again.');
    return;
  }

  const caption = `${cached.name}\n${formatGHS(cached.price)} · ${cached.condition} · ${cached.campus}`;
  if (cached.image) {
    await wa.sendImage(to, cached.image, caption);
  } else {
    await wa.sendText(to, caption);
  }

  await wa.sendButtons(to, 'What would you like to do?', [
    { id: `order_${productId}`, title: '🛒 Order this' },
    { id: 'menu_search', title: '🔍 Search again' },
  ]);
}

// ── Ordering ─────────────────────────────────────────────────────────────

async function beginOrder(to, session, productId) {
  const cached = session.data.lastResults?.[productId];
  if (!cached) {
    await wa.sendText(to, 'That listing expired from this chat — try searching again.');
    return;
  }

  if (!session.data.userId) {
    await startOnboarding(to, session, { action: 'order', product: cached });
    return;
  }

  session.step = 'awaiting_quantity';
  session.data.pendingOrder = cached;
  await saveSession(to, session);
  await wa.sendText(to, `How many "${cached.name}" would you like? Reply with a number.`);
}

async function handleQuantity(to, session, text) {
  const qty = parseInt(text.trim(), 10);
  if (!qty || qty < 1 || qty > 20) {
    await wa.sendText(to, 'Please reply with a valid quantity, e.g. 1');
    return;
  }

  const product = session.data.pendingOrder;
  product.quantity = qty;
  const total = product.price * qty;

  session.step = 'checkout_confirm';
  await saveSession(to, session);

  await wa.sendButtons(
    to,
    `Confirm order:\n\n${product.name}\n${qty} × ${formatGHS(product.price)} = *${formatGHS(total)}*`,
    [
      { id: 'confirm_order', title: '✅ Confirm order' },
      { id: 'cancel_order', title: '✖️ Cancel' },
    ]
  );
}

async function confirmOrder(to, session) {
  const product = session.data.pendingOrder;
  let order;
  try {
    order = await cedimart.createOrder({
      userId: session.data.userId,
      productId: product.id,
      quantity: product.quantity,
    });
  } catch (err) {
    console.error('WA order creation failed:', err.message);
    await wa.sendText(to, "Couldn't place that order just now — please try again shortly.");
    return;
  }

  const total = product.price * product.quantity;
  const orderRef = order?._id || order?.id || Date.now().toString(36).toUpperCase();

  // Simple text invoice — no PDF/media upload required. Upgrade to a
  // generated PDF later (send via `link` once it's hosted somewhere public,
  // e.g. the same Supabase bucket your product images live in).
  const invoice = [
    '🧾 *CediMart Invoice*',
    `Order: #${orderRef}`,
    `Item: ${product.name}`,
    `Qty: ${product.quantity}`,
    `Unit price: ${formatGHS(product.price)}`,
    `*Total: ${formatGHS(total)}*`,
    '',
    `Buyer: ${session.data.name}`,
    `Campus: ${session.data.campus}`,
    '',
    "We'll message you here once the seller confirms. Thanks for shopping on CediMart! 💚",
  ].join('\n');

  await wa.sendText(to, invoice);

  session.step = 'idle';
  session.data.pendingOrder = null;
  await saveSession(to, session);
}

async function cancelOrder(to, session) {
  session.step = 'idle';
  session.data.pendingOrder = null;
  await saveSession(to, session);
  await wa.sendText(to, "No worries, order cancelled. Send another search whenever you're ready.");
}

// ── Main entry point ─────────────────────────────────────────────────────

async function handleIncomingMessage(from, rawMessage) {
  const message = parseIncoming(rawMessage);
  const session = await getSession(from);

  // Global commands, available from any step.
  if (message.type === 'text') {
    const lower = message.text.toLowerCase();
    if (['hi', 'hello', 'hey', 'menu', 'start'].includes(lower)) {
      session.step = 'idle';
      await saveSession(from, session);
      await sendMainMenu(from, session.data.name);
      return;
    }
    if (lower === 'help') {
      await wa.sendText(from, 'Just tell me what you\'re looking for — e.g. "laptop under GHS 4000" — and I\'ll search CediMart for you.');
      return;
    }
  }
  if (message.type === 'reply') {
    if (message.replyId === 'menu_search') {
      session.step = 'idle';
      await saveSession(from, session);
      await wa.sendText(from, 'What are you looking for?');
      return;
    }
    if (message.replyId === 'menu_help') {
      await wa.sendText(from, 'Just tell me what you\'re looking for — e.g. "laptop under GHS 4000" — and I\'ll search CediMart for you.');
      return;
    }
    if (message.replyId === 'menu_orders') {
      await wa.sendText(from, 'Order history over WhatsApp is coming soon — check the CediMart app for now.');
      return;
    }
  }

  // Step-specific routing.
  switch (session.step) {
    case 'onboarding_name':
      if (message.type === 'text') return handleOnboardingName(from, session, message.text);
      return wa.sendText(from, 'Please reply with your name to continue.');

    case 'onboarding_campus':
      if (message.type === 'reply' && message.replyId.startsWith('campus_')) {
        return handleOnboardingCampus(from, session, message.replyId);
      }
      return wa.sendText(from, 'Please pick your campus from the list above.');

    case 'awaiting_quantity':
      if (message.type === 'text') return handleQuantity(from, session, message.text);
      return wa.sendText(from, 'Please reply with a number, e.g. 1');

    case 'checkout_confirm':
      if (message.replyId === 'confirm_order') return confirmOrder(from, session);
      if (message.replyId === 'cancel_order') return cancelOrder(from, session);
      return wa.sendText(from, 'Please tap "Confirm order" or "Cancel" above.');

    default: // idle
      if (message.type === 'reply' && message.replyId?.startsWith('product_')) {
        return showProductDetail(from, session, message.replyId.replace('product_', ''));
      }
      if (message.type === 'reply' && message.replyId?.startsWith('order_')) {
        return beginOrder(from, session, message.replyId.replace('order_', ''));
      }
      if (message.type === 'text') {
        return handleSearch(from, session, message.text);
      }
      return wa.sendText(from, "Sorry, I didn't catch that. Send 'menu' to see what I can do.");
  }
}

module.exports = { handleIncomingMessage };