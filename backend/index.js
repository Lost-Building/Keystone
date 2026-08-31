require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const { db, centsToGame, uuidv4 } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','));
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2026-08-26.dahlia',
      appInfo: { name: 'KeyStone', version: '0.1.0' }
    })
  : null;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn('WARNING: Set JWT_SECRET to a long random secret before storing real user data.');
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }
}));

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Stripe webhook is not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.warn(`Stripe webhook signature verification failed: ${error.message}`);
    return res.status(400).send('Invalid signature');
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.payment_status !== 'unpaid') {
      fulfillCheckoutSession(session.id, session.payment_intent);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    db.prepare('UPDATE checkout_orders SET status = ? WHERE stripe_session_id = ? AND status = ?').run('failed', session.id, 'pending');
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false }));
app.use('/api/developer', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

function parseMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function audit(req, action, metadata = {}) {
  db.prepare(`
    INSERT INTO audit_log (id, user_id, action, ip, user_agent, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), req.user?.id || null, action, req.ip, req.get('user-agent') || null, JSON.stringify(metadata));
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
    mfaEnabled: Boolean(row.mfa_enabled)
  };
}

function signToken(user) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireAuth(req, res, next) {
  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(claims.sub);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role && req.user?.role !== 'admin') {
      audit(req, 'authorization_denied', { requiredRole: role });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
}

function fulfillCheckoutSession(sessionId, paymentIntentId) {
  const fulfill = db.transaction(() => {
    const order = db.prepare('SELECT * FROM checkout_orders WHERE stripe_session_id = ?').get(sessionId);
    if (!order || order.status === 'fulfilled') return;

    const key = db.prepare('SELECT * FROM ownership WHERE key_id = ? AND is_listed_for_sale = 1').get(order.key_id);
    if (!key || key.owner_id !== order.seller_id) {
      db.prepare('UPDATE checkout_orders SET status = ? WHERE stripe_session_id = ?').run('needs_review', sessionId);
      return;
    }

    db.prepare(`
      UPDATE ownership
      SET owner_id = ?, is_listed_for_sale = 0, sale_price_cents = NULL
      WHERE key_id = ?
    `).run(order.buyer_id, order.key_id);

    db.prepare(`
      UPDATE checkout_orders
      SET status = ?, fulfilled_at = CURRENT_TIMESTAMP
      WHERE stripe_session_id = ?
    `).run('fulfilled', sessionId);

    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, metadata)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), order.buyer_id, 'stripe_checkout_fulfilled', JSON.stringify({
      keyId: order.key_id,
      stripeSessionId: sessionId,
      paymentIntentId
    }));
  });

  fulfill();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  const username = cleanText(req.body.username, 32);
  const email = cleanText(req.body.email, 254)?.toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !email || !email.includes('@') || password.length < 12) {
    return res.status(400).json({ error: 'Username, valid email, and a 12+ character password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) return res.status(409).json({ error: 'Username or email is already registered' });

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(userId, username, email, passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  req.user = user;
  audit(req, 'user_registered');
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanText(req.body.email, 254)?.toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.user = user;
  audit(req, 'user_logged_in');
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/library/me', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT ownership.key_id, ownership.is_listed_for_sale, ownership.sale_price_cents,
      games.id, games.title, games.developer, games.price_cents, games.image, games.genre
    FROM ownership
    JOIN games ON games.id = ownership.game_id
    WHERE ownership.owner_id = ?
    ORDER BY ownership.created_at DESC
  `).all(req.user.id);

  res.json(rows.map((row) => ({
    keyId: row.key_id,
    game: centsToGame(row),
    isListedForSale: Boolean(row.is_listed_for_sale),
    salePrice: row.sale_price_cents ? row.sale_price_cents / 100 : undefined
  })));
});

app.get('/api/marketplace', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT ownership.key_id, ownership.owner_id, ownership.sale_price_cents,
      games.id, games.title, games.developer, games.price_cents, games.image, games.genre
    FROM ownership
    JOIN games ON games.id = ownership.game_id
    WHERE ownership.is_listed_for_sale = 1
    ORDER BY ownership.created_at DESC
  `).all();

  res.json(rows.map((row) => ({
    keyId: row.key_id,
    game: centsToGame(row),
    sellerId: row.owner_id,
    salePrice: row.sale_price_cents / 100
  })));
});

app.post('/api/marketplace/sell', requireAuth, (req, res) => {
  const keyId = cleanText(req.body.keyId, 80);
  const salePriceCents = parseMoney(req.body.price);

  if (!keyId || salePriceCents === null || salePriceCents <= 0 || salePriceCents > 1000000) {
    return res.status(400).json({ error: 'Invalid listing request' });
  }

  const result = db.prepare(`
    UPDATE ownership
    SET is_listed_for_sale = 1, sale_price_cents = ?
    WHERE key_id = ? AND owner_id = ?
  `).run(salePriceCents, keyId, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Key not found or not owned by user' });

  audit(req, 'marketplace_listed', { keyId, salePriceCents });
  res.json({ success: true, message: 'Game listed on marketplace successfully' });
});

app.post('/api/marketplace/buy', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Direct purchases are disabled. Use Stripe Checkout.' });
});

app.post('/api/checkout/marketplace', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to backend .env.' });
  }

  const keyId = cleanText(req.body.keyId, 80);
  if (!keyId) return res.status(400).json({ error: 'Invalid checkout request' });

  const listing = db.prepare(`
    SELECT ownership.key_id, ownership.owner_id, ownership.sale_price_cents,
      games.title, games.developer
    FROM ownership
    JOIN games ON games.id = ownership.game_id
    WHERE ownership.key_id = ? AND ownership.is_listed_for_sale = 1
  `).get(keyId);

  if (!listing) return res.status(404).json({ error: 'Key not available for sale' });
  if (listing.owner_id === req.user.id) return res.status(400).json({ error: 'Cannot buy your own listing' });

  const orderId = uuidv4();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: listing.sale_price_cents,
        product_data: {
          name: listing.title,
          description: `KeyStone game key from ${listing.developer}`
        }
      },
      quantity: 1
    }],
    metadata: {
      orderId,
      keyId: listing.key_id,
      buyerId: req.user.id,
      sellerId: listing.owner_id
    },
    success_url: `${APP_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}?checkout=cancelled`,
    integration_identifier: 'keystone_checkout_abcdwxyz'
  });

  db.prepare(`
    INSERT INTO checkout_orders (id, stripe_session_id, buyer_id, key_id, seller_id, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, session.id, req.user.id, listing.key_id, listing.owner_id, listing.sale_price_cents);

  audit(req, 'stripe_checkout_created', { orderId, keyId: listing.key_id, stripeSessionId: session.id });
  res.status(201).json({ url: session.url });
});

app.post('/api/developer/upload', requireAuth, requireRole('developer'), (req, res) => {
  const title = cleanText(req.body.title, 120);
  const developer = cleanText(req.body.developer, 80);
  const genre = req.body.genre ? cleanText(req.body.genre, 40) : null;
  const priceCents = parseMoney(req.body.price);

  if (!title || !developer || priceCents === null || priceCents < 0 || priceCents > 100000) {
    return res.status(400).json({ error: 'Invalid game upload' });
  }

  const gameId = uuidv4();
  db.prepare('INSERT INTO games (id, title, developer, price_cents, genre) VALUES (?, ?, ?, ?, ?)').run(gameId, title, developer, priceCents, genre);
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);

  audit(req, 'developer_game_uploaded', { gameId });
  res.status(201).json({ success: true, message: 'Game added to catalog successfully', game: centsToGame(game) });
});

app.post('/api/payments/methods', requireAuth, (req, res) => {
  const provider = cleanText(req.body.provider, 40);
  const providerCustomerId = cleanText(req.body.providerCustomerId, 120);
  const providerPaymentMethodId = cleanText(req.body.providerPaymentMethodId, 120);
  const brand = req.body.brand ? cleanText(req.body.brand, 40) : null;
  const last4 = typeof req.body.last4 === 'string' && /^\d{4}$/.test(req.body.last4) ? req.body.last4 : null;

  if (!provider || !providerCustomerId || !providerPaymentMethodId) {
    return res.status(400).json({ error: 'Use a payment provider token. Raw card data is not accepted.' });
  }

  db.prepare(`
    INSERT INTO payment_methods (id, user_id, provider, provider_customer_id, provider_payment_method_id, brand, last4, expires_month, expires_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    req.user.id,
    provider,
    providerCustomerId,
    providerPaymentMethodId,
    brand,
    last4,
    Number.isInteger(req.body.expiresMonth) ? req.body.expiresMonth : null,
    Number.isInteger(req.body.expiresYear) ? req.body.expiresYear : null
  );

  audit(req, 'payment_method_added', { provider, brand, last4 });
  res.status(201).json({ success: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
