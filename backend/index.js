const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const multer = require('multer');
const archiver = require('archiver');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const { db, transaction, initDb, centsToGame, uuidv4 } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const GAME_UPLOAD_ROOT = path.resolve(process.env.GAME_UPLOAD_DIR || path.join(__dirname, 'uploads', 'games'));
const MAX_GAME_FILE_BYTES = Number(process.env.MAX_GAME_FILE_BYTES) || 5 * 1024 * 1024 * 1024;
const DISC_KEY_DIR = path.join(__dirname, 'data');
const GAME_FILE_EXTENSIONS = new Set([
  '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz',
  '.exe', '.msi', '.msix', '.appx', '.appxbundle', '.dmg', '.pkg', '.deb', '.rpm', '.appimage',
  '.apk', '.aab', '.ipa', '.xci', '.nsp',
  '.html', '.htm', '.wasm', '.jar', '.love', '.nw',
  '.iso', '.bin', '.cue', '.img', '.pak', '.vpk', '.wad', '.pk3', '.obb', '.dll', '.so', '.dylib',
  '.unitypackage', '.unity', '.asset', '.prefab', '.mat', '.controller', '.anim', '.uproject', '.uplugin',
  '.godot', '.pck', '.project.godot', '.tscn', '.scn', '.tres', '.res', '.yyp', '.yy', '.c3p', '.capx', '.rpy', '.rpyc',
  '.rpgproject', '.rmmzproject', '.rmmvproject', '.project', '.collection', '.atlas', '.tmx', '.ase', '.aseprite', '.spine', '.skel', '.bytes',
  '.blend', '.blend1', '.fbx', '.obj', '.dae', '.3ds', '.stl', '.gltf', '.glb',
  '.png', '.jpg', '.jpeg', '.webp', '.tga', '.tif', '.tiff', '.bmp', '.psd', '.kra', '.svg', '.dds', '.ktx', '.ktx2', '.exr', '.hdr',
  '.wav', '.mp3', '.ogg', '.oga', '.flac', '.aac', '.m4a', '.opus', '.mid', '.midi',
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.csv', '.txt', '.md',
  '.cs', '.cpp', '.c', '.h', '.hpp', '.js', '.ts', '.tsx', '.jsx', '.lua', '.py', '.gd', '.shader', '.hlsl', '.glsl', '.wgsl'
]);
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','));
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2026-08-26.dahlia',
      appInfo: { name: 'KeyStone', version: '0.1.0' }
    })
  : null;

fs.mkdirSync(GAME_UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(DISC_KEY_DIR, { recursive: true });

function loadDiscSigningKeys() {
  const privateKeyPath = path.join(DISC_KEY_DIR, 'disc-signing-private.pem');
  const publicKeyPath = path.join(DISC_KEY_DIR, 'disc-signing-public.pem');
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    const pair = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(privateKeyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(publicKeyPath, pair.publicKey.export({ type: 'spki', format: 'pem' }));
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
  const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
  const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex');
  return { privateKey, publicKeyPem, fingerprint };
}

const discSigningKeys = loadDiscSigningKeys();

const gameUpload = multer({
  storage: multer.diskStorage({
    destination: GAME_UPLOAD_ROOT,
    filename(req, file, callback) {
      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-160) || 'game-file';
      callback(null, `${uuidv4()}-${safeName}`);
    }
  }),
  limits: { files: 36, fileSize: MAX_GAME_FILE_BYTES },
  fileFilter(req, file, callback) {
    const lowerName = file.originalname.toLowerCase();
    const extension = [...GAME_FILE_EXTENSIONS].find((item) => lowerName.endsWith(item));
    callback(extension ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), Boolean(extension));
  }
});

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

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
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
      await fulfillCheckoutSession(session.id, session.payment_intent);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    await db.prepare('UPDATE checkout_orders SET status = ? WHERE stripe_session_id = ? AND status = ?').run('failed', session.id, 'pending');
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

function cleanTags(value) {
  let tags = value;
  if (typeof value === 'string') {
    try { tags = JSON.parse(value); } catch { tags = value.split(','); }
  }
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => cleanText(String(tag), 30)?.toLowerCase()).filter(Boolean))].slice(0, 12);
}

function uploadedFiles(req) {
  return Object.values(req.files || {}).flat();
}

async function publishingGame(row) {
  const media = row.publishing_status === 'published'
    ? await db.prepare(`
        SELECT original_name, stored_name, mime_type, size_bytes, file_kind FROM game_uploads
        WHERE game_id = ? AND (release_id IS NULL OR release_id IN (SELECT id FROM game_releases WHERE game_id = ? AND is_live = TRUE))
        ORDER BY created_at
      `).all(row.id, row.id)
    : await db.prepare('SELECT original_name, stored_name, mime_type, size_bytes, file_kind FROM game_uploads WHERE game_id = ? ORDER BY created_at').all(row.id);
  const releaseRows = await db.prepare('SELECT * FROM game_releases WHERE game_id = ? ORDER BY submitted_at DESC').all(row.id);
  const releases = await Promise.all(releaseRows.map(async (release) => {
    const files = await db.prepare('SELECT original_name, stored_name, size_bytes, file_kind FROM game_uploads WHERE release_id = ? ORDER BY created_at').all(release.id);
    return {
      id: release.id,
      version: release.version,
      releaseNotes: release.release_notes,
      reviewStatus: release.review_status,
      reviewNotes: release.review_notes || '',
      submittedAt: release.submitted_at,
      releasedAt: release.released_at,
      isLive: Boolean(release.is_live),
      media: files.map((file) => ({
        name: file.original_name,
        kind: file.file_kind,
        size: Number(file.size_bytes),
        url: file.file_kind === 'build' ? undefined : `/api/store/media/${encodeURIComponent(file.stored_name)}`,
        reviewPath: `/api/admin/reviews/${row.id}/files/${encodeURIComponent(file.stored_name)}`
      }))
    };
  }));
  return {
    ...centsToGame(row),
    description: row.description || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    publishingStatus: row.publishing_status,
    reviewNotes: row.review_notes || '',
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    releases,
    media: media.map((file) => ({
      name: file.original_name,
      kind: file.file_kind,
      size: Number(file.size_bytes),
      url: file.file_kind === 'build' ? undefined : `/api/store/media/${encodeURIComponent(file.stored_name)}`,
      reviewPath: `/api/admin/reviews/${row.id}/files/${encodeURIComponent(file.stored_name)}`
    }))
  };
}

async function audit(req, action, metadata = {}) {
  await db.prepare(`
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

async function requireAuth(req, res, next) {
  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(claims.sub);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

function requireRole(role) {
  return async (req, res, next) => {
    if (req.user?.role !== role && req.user?.role !== 'admin') {
      await audit(req, 'authorization_denied', { requiredRole: role });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
}

async function fulfillCheckoutSession(sessionId, paymentIntentId) {
  await transaction(async (tx) => {
    const order = await tx.prepare('SELECT * FROM checkout_orders WHERE stripe_session_id = ?').get(sessionId);
    if (!order || order.status === 'fulfilled') return;

    const key = await tx.prepare('SELECT * FROM ownership WHERE key_id = ? AND is_listed_for_sale = TRUE').get(order.key_id);
    if (!key || key.owner_id !== order.seller_id) {
      await tx.prepare('UPDATE checkout_orders SET status = ? WHERE stripe_session_id = ?').run('needs_review', sessionId);
      return;
    }

    await tx.prepare(`
      UPDATE ownership
      SET owner_id = ?, is_listed_for_sale = FALSE, sale_price_cents = NULL
      WHERE key_id = ?
    `).run(order.buyer_id, order.key_id);

    await tx.prepare(`
      UPDATE checkout_orders
      SET status = ?, fulfilled_at = CURRENT_TIMESTAMP
      WHERE stripe_session_id = ?
    `).run('fulfilled', sessionId);

    await tx.prepare(`
      INSERT INTO audit_log (id, user_id, action, metadata)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), order.buyer_id, 'stripe_checkout_fulfilled', JSON.stringify({
      keyId: order.key_id,
      stripeSessionId: sessionId,
      paymentIntentId
    }));
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/store/media/:storedName', async (req, res) => {
  const storedName = path.basename(req.params.storedName);
  const file = await db.prepare(`
    SELECT stored_name FROM game_uploads
    WHERE stored_name = ? AND file_kind IN ('cover', 'screenshot', 'video')
  `).get(storedName);
  if (!file) return res.status(404).json({ error: 'Media not found' });
  return res.sendFile(path.join(GAME_UPLOAD_ROOT, file.stored_name));
});

app.get('/api/store/games', async (req, res) => {
  const rows = await db.prepare(`SELECT * FROM games WHERE publishing_status = 'published' ORDER BY published_at DESC NULLS LAST, created_at DESC`).all();
  res.json(await Promise.all(rows.map(publishingGame)));
});

app.post('/api/auth/register', async (req, res) => {
  const username = cleanText(req.body.username, 32);
  const email = cleanText(req.body.email, 254)?.toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !email || !email.includes('@') || password.length < 12) {
    return res.status(400).json({ error: 'Username, valid email, and a 12+ character password are required' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) return res.status(409).json({ error: 'Username or email is already registered' });

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);
  await db.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(userId, username, email, passwordHash);

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  req.user = user;
  await audit(req, 'user_registered');
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = cleanText(req.body.identifier || req.body.email, 254);
  const normalizedIdentifier = identifier?.toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = normalizedIdentifier
    ? await db.prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ?').get(normalizedIdentifier, normalizedIdentifier)
    : null;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email, username, or password' });
  }

  req.user = user;
  await audit(req, 'user_logged_in');
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/library/me', requireAuth, async (req, res) => {
  const rows = await db.prepare(`
    SELECT ownership.key_id, ownership.is_listed_for_sale, ownership.sale_price_cents, ownership.license_medium,
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
    licenseMedium: row.license_medium,
    salePrice: row.sale_price_cents ? row.sale_price_cents / 100 : undefined
  })));
});

app.post('/api/library/:keyId/disc/prepare', requireAuth, async (req, res) => {
  const ownership = await db.prepare(`
    SELECT ownership.*, games.title, games.publishing_status
    FROM ownership JOIN games ON games.id = ownership.game_id
    WHERE ownership.key_id = ? AND ownership.owner_id = ?
  `).get(req.params.keyId, req.user.id);
  if (!ownership || ownership.license_medium !== 'digital' || ownership.is_listed_for_sale || ownership.publishing_status !== 'published') {
    return res.status(409).json({ error: 'Only an owned, unlisted digital game can be converted to disc mode.' });
  }
  let discExport = await db.prepare('SELECT * FROM disc_exports WHERE key_id = ?').get(ownership.key_id);
  if (!discExport) {
    discExport = { id: uuidv4(), certificate_id: uuidv4() };
    await db.prepare('INSERT INTO disc_exports (id, key_id, owner_id, game_id, certificate_id) VALUES (?, ?, ?, ?, ?)').run(
      discExport.id, ownership.key_id, req.user.id, ownership.game_id, discExport.certificate_id
    );
  }
  await audit(req, 'disc_conversion_prepared', { gameId: ownership.game_id, discExportId: discExport.id });
  res.json({
    exportId: discExport.id,
    downloadPath: `/api/library/disc/${discExport.id}/package`,
    warning: 'After confirming disc activation, digital download and launch rights for this license are permanently disabled.'
  });
});

app.get('/api/library/disc/:exportId/package', requireAuth, async (req, res, next) => {
  const discExport = await db.prepare(`
    SELECT disc_exports.*, games.title, games.developer
    FROM disc_exports JOIN games ON games.id = disc_exports.game_id
    WHERE disc_exports.id = ? AND disc_exports.owner_id = ? AND disc_exports.status = 'prepared'
  `).get(req.params.exportId, req.user.id);
  if (!discExport) return res.status(404).json({ error: 'Disc package not found or already activated.' });
  const files = await db.prepare(`
    SELECT game_uploads.* FROM game_uploads
    JOIN game_releases ON game_releases.id = game_uploads.release_id
    WHERE game_uploads.game_id = ? AND game_uploads.file_kind = 'build' AND game_releases.is_live = TRUE
  `).all(discExport.game_id);
  if (!files.length) return res.status(409).json({ error: 'This game has no live build available for disc conversion.' });

  const payload = {
    format: 'keystone-offline-entitlement-v1',
    certificateId: discExport.certificate_id,
    gameId: discExport.game_id,
    title: discExport.title,
    issuedAt: new Date().toISOString(),
    offline: true,
    licenseCount: 1,
    signingKeyFingerprint: discSigningKeys.fingerprint
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload));
  const certificate = { payload, signature: crypto.sign(null, encodedPayload, discSigningKeys.privateKey).toString('base64url'), algorithm: 'Ed25519' };
  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', next);
  res.attachment(`${discExport.title.replace(/[^a-z0-9_-]+/gi, '-')}-offline-disc.zip`);
  archive.pipe(res);
  archive.append(JSON.stringify(certificate, null, 2), { name: 'KEYSTONE-LICENSE.json' });
  archive.append(discSigningKeys.publicKeyPem, { name: 'KEYSTONE-PUBLIC-KEY.pem' });
  archive.file(path.join(__dirname, '..', 'docs', 'OFFLINE_DISC_LICENSE.md'), { name: 'LICENSE-AND-DISC-POLICY.md' });
  for (const file of files) archive.file(path.join(GAME_UPLOAD_ROOT, file.stored_name), { name: `game/${path.basename(file.original_name)}` });
  await archive.finalize();
});

app.post('/api/library/disc/:exportId/downloaded', requireAuth, async (req, res) => {
  const result = await db.prepare(`UPDATE disc_exports SET downloaded_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND status = 'prepared'`).run(req.params.exportId, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Disc conversion not found.' });
  res.json({ success: true });
});

app.post('/api/library/disc/:exportId/activate', requireAuth, async (req, res) => {
  const discExport = await db.prepare(`SELECT * FROM disc_exports WHERE id = ? AND owner_id = ? AND status = 'prepared' AND downloaded_at IS NOT NULL`).get(req.params.exportId, req.user.id);
  if (!discExport) return res.status(409).json({ error: 'Download the disc package before activating disc mode.' });
  await transaction(async (tx) => {
    const changed = await tx.prepare(`
      UPDATE ownership SET license_medium = 'disc', digital_disabled_at = CURRENT_TIMESTAMP, is_listed_for_sale = FALSE, sale_price_cents = NULL
      WHERE key_id = ? AND owner_id = ? AND license_medium = 'digital'
    `).run(discExport.key_id, req.user.id);
    if (!changed.changes) throw new Error('Digital entitlement is no longer active');
    await tx.prepare(`UPDATE disc_exports SET status = 'active', activated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(discExport.id);
  });
  await audit(req, 'disc_license_activated', { gameId: discExport.game_id, discExportId: discExport.id });
  res.json({ success: true, message: 'Disc mode is active. Digital launch and download rights are now disabled for this license.' });
});

app.get('/api/disc/public-key', (req, res) => {
  res.json({ algorithm: 'Ed25519', fingerprint: discSigningKeys.fingerprint, publicKey: discSigningKeys.publicKeyPem });
});

app.get('/api/marketplace', requireAuth, async (req, res) => {
  const rows = await db.prepare(`
    SELECT ownership.key_id, ownership.owner_id, ownership.sale_price_cents,
      games.id, games.title, games.developer, games.price_cents, games.image, games.genre
    FROM ownership
    JOIN games ON games.id = ownership.game_id
    WHERE ownership.is_listed_for_sale = TRUE AND ownership.license_medium = 'digital'
    ORDER BY ownership.created_at DESC
  `).all();

  res.json(rows.map((row) => ({
    keyId: row.key_id,
    game: centsToGame(row),
    sellerId: row.owner_id,
    salePrice: row.sale_price_cents / 100
  })));
});

app.post('/api/marketplace/sell', requireAuth, async (req, res) => {
  const keyId = cleanText(req.body.keyId, 80);
  const salePriceCents = parseMoney(req.body.price);

  if (!keyId || salePriceCents === null || salePriceCents <= 0 || salePriceCents > 1000000) {
    return res.status(400).json({ error: 'Invalid listing request' });
  }

  const result = await db.prepare(`
    UPDATE ownership
    SET is_listed_for_sale = TRUE, sale_price_cents = ?
    WHERE key_id = ? AND owner_id = ? AND license_medium = 'digital'
  `).run(salePriceCents, keyId, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Key not found or not owned by user' });

  await audit(req, 'marketplace_listed', { keyId, salePriceCents });
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

  const listing = await db.prepare(`
    SELECT ownership.key_id, ownership.owner_id, ownership.sale_price_cents,
      games.title, games.developer
    FROM ownership
    JOIN games ON games.id = ownership.game_id
    WHERE ownership.key_id = ? AND ownership.is_listed_for_sale = TRUE AND ownership.license_medium = 'digital'
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

  await db.prepare(`
    INSERT INTO checkout_orders (id, stripe_session_id, buyer_id, key_id, seller_id, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, session.id, req.user.id, listing.key_id, listing.owner_id, listing.sale_price_cents);

  await audit(req, 'stripe_checkout_created', { orderId, keyId: listing.key_id, stripeSessionId: session.id });
  res.status(201).json({ url: session.url });
});

app.post('/api/developer/upload', requireAuth, requireRole('developer'), (req, res, next) => {
  gameUpload.fields([
    { name: 'gameFiles', maxCount: 20 },
    { name: 'cover', maxCount: 1 },
    { name: 'screenshots', maxCount: 10 },
    { name: 'videos', maxCount: 5 }
  ])(req, res, (error) => {
    if (!error) return next();
    for (const file of uploadedFiles(req)) fs.rmSync(file.path, { force: true });
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `Each game file must be ${Math.floor(MAX_GAME_FILE_BYTES / (1024 ** 3))} GB or smaller.`
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'Upload no more than 20 builds, 10 screenshots, 5 videos, and 1 cover at once.'
        : 'One or more files use an unsupported game-development format.';
    return res.status(400).json({ error: message });
  });
}, async (req, res) => {
  const title = cleanText(req.body.title, 120);
  const developer = cleanText(req.body.developer, 80);
  const genre = req.body.genre ? cleanText(req.body.genre, 40) : null;
  const description = cleanText(req.body.description, 5000);
  const tags = cleanTags(req.body.tags);
  const priceCents = parseMoney(req.body.price);
  const buildFiles = req.files?.gameFiles || [];
  const coverFiles = req.files?.cover || [];
  const screenshotFiles = req.files?.screenshots || [];
  const videoFiles = req.files?.videos || [];
  const allFiles = uploadedFiles(req);
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const videoExtensions = new Set(['.mp4', '.webm', '.mov']);
  const mediaAreValid = [...coverFiles, ...screenshotFiles].every((file) => imageExtensions.has(path.extname(file.originalname).toLowerCase()))
    && videoFiles.every((file) => videoExtensions.has(path.extname(file.originalname).toLowerCase()));

  if (!title || !developer || !description || priceCents === null || priceCents < 0 || priceCents > 100000 || !buildFiles.length || !mediaAreValid) {
    for (const file of allFiles) fs.rmSync(file.path, { force: true });
    return res.status(400).json({ error: 'A title, studio, description, valid price, game build, and valid store media are required.' });
  }

  const gameId = uuidv4();
  const releaseId = uuidv4();
  const coverUrl = coverFiles[0] ? `/api/store/media/${encodeURIComponent(coverFiles[0].filename)}` : null;
  try {
    await transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO games (id, title, developer, price_cents, image, genre, owner_id, description, tags, publishing_status, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', CURRENT_TIMESTAMP)
      `).run(gameId, title, developer, priceCents, coverUrl, genre, req.user.id, description, JSON.stringify(tags));
      await tx.prepare(`INSERT INTO game_releases (id, game_id, version, release_notes) VALUES (?, ?, '1.0.0', 'Initial release')`).run(releaseId, gameId);
      for (const file of allFiles) {
        const fileKind = coverFiles.includes(file) ? 'cover' : screenshotFiles.includes(file) ? 'screenshot' : videoFiles.includes(file) ? 'video' : 'build';
        await tx.prepare('INSERT INTO game_uploads (id, game_id, original_name, stored_name, mime_type, size_bytes, file_kind, release_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          uuidv4(), gameId, path.basename(file.originalname), file.filename, file.mimetype || null, file.size, fileKind, releaseId
        );
      }
    });
  } catch (error) {
    for (const file of allFiles) fs.rmSync(file.path, { force: true });
    throw error;
  }
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);

  await audit(req, 'developer_game_submitted', { gameId, fileCount: allFiles.length });
  res.status(201).json({ success: true, message: 'Game submitted for review', game: await publishingGame(game), fileCount: allFiles.length });
});

app.get('/api/developer/games', requireAuth, requireRole('developer'), async (req, res) => {
  const rows = req.user.role === 'admin'
    ? await db.prepare('SELECT * FROM games WHERE owner_id IS NOT NULL ORDER BY created_at DESC').all()
    : await db.prepare('SELECT * FROM games WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(await Promise.all(rows.map(publishingGame)));
});

app.post('/api/developer/games/:gameId/updates', requireAuth, requireRole('developer'), (req, res, next) => {
  gameUpload.fields([
    { name: 'gameFiles', maxCount: 20 }, { name: 'cover', maxCount: 1 },
    { name: 'screenshots', maxCount: 10 }, { name: 'videos', maxCount: 5 }
  ])(req, res, (error) => {
    if (!error) return next();
    for (const file of uploadedFiles(req)) fs.rmSync(file.path, { force: true });
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'An update file is too large.' : 'The update contains too many or unsupported files.' });
  });
}, async (req, res) => {
  const game = await db.prepare('SELECT * FROM games WHERE id = ? AND owner_id = ?').get(req.params.gameId, req.user.id);
  const version = cleanText(req.body.version, 30);
  const releaseNotes = cleanText(req.body.releaseNotes, 5000);
  const buildFiles = req.files?.gameFiles || [];
  const coverFiles = req.files?.cover || [];
  const screenshotFiles = req.files?.screenshots || [];
  const videoFiles = req.files?.videos || [];
  const allFiles = uploadedFiles(req);
  const mediaAreValid = [...coverFiles, ...screenshotFiles].every((file) => ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase()))
    && videoFiles.every((file) => ['.mp4', '.webm', '.mov'].includes(path.extname(file.originalname).toLowerCase()));
  const activeCandidate = game && await db.prepare(`SELECT id FROM game_releases WHERE game_id = ? AND review_status IN ('pending_review', 'approved') AND is_live = FALSE`).get(game.id);

  if (!game || game.publishing_status !== 'published' || !version || !/^[a-zA-Z0-9._-]+$/.test(version) || !releaseNotes || !buildFiles.length || !mediaAreValid || activeCandidate) {
    for (const file of allFiles) fs.rmSync(file.path, { force: true });
    return res.status(400).json({ error: activeCandidate ? 'Finish or release the current update before submitting another.' : 'A published game, version, release notes, and valid replacement build are required.' });
  }

  const releaseId = uuidv4();
  const storeChanges = {};
  const description = req.body.description ? cleanText(req.body.description, 5000) : null;
  const genre = req.body.genre ? cleanText(req.body.genre, 40) : null;
  const tags = req.body.tags ? cleanTags(req.body.tags) : null;
  const priceCents = req.body.price === undefined || req.body.price === '' ? null : parseMoney(req.body.price);
  if (description) storeChanges.description = description;
  if (genre) storeChanges.genre = genre;
  if (tags) storeChanges.tags = tags;
  if (priceCents !== null && priceCents >= 0 && priceCents <= 100000) storeChanges.priceCents = priceCents;
  if (coverFiles[0]) storeChanges.image = `/api/store/media/${encodeURIComponent(coverFiles[0].filename)}`;

  try {
    await transaction(async (tx) => {
      await tx.prepare('INSERT INTO game_releases (id, game_id, version, release_notes, store_changes) VALUES (?, ?, ?, ?, ?)').run(releaseId, game.id, version, releaseNotes, JSON.stringify(storeChanges));
      for (const file of allFiles) {
        const kind = coverFiles.includes(file) ? 'cover' : screenshotFiles.includes(file) ? 'screenshot' : videoFiles.includes(file) ? 'video' : 'build';
        await tx.prepare('INSERT INTO game_uploads (id, game_id, original_name, stored_name, mime_type, size_bytes, file_kind, release_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          uuidv4(), game.id, path.basename(file.originalname), file.filename, file.mimetype || null, file.size, kind, releaseId
        );
      }
    });
  } catch (error) {
    for (const file of allFiles) fs.rmSync(file.path, { force: true });
    if (error.code === '23505') return res.status(409).json({ error: 'That version number already exists for this game.' });
    throw error;
  }
  await audit(req, 'developer_update_submitted', { gameId: game.id, releaseId, version });
  res.status(201).json({ success: true, message: `Version ${version} submitted for review` });
});

app.post('/api/developer/games/:gameId/release', requireAuth, requireRole('developer'), async (req, res) => {
  const game = await db.prepare(`SELECT * FROM games WHERE id = ? AND owner_id = ? AND publishing_status = 'approved'`).get(req.params.gameId, req.user.id);
  if (!game) return res.status(409).json({ error: 'Only an approved game owned by you can be released.' });
  await transaction(async (tx) => {
    await tx.prepare(`UPDATE games SET publishing_status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?`).run(game.id);
    await tx.prepare(`UPDATE game_releases SET review_status = 'released', is_live = TRUE, released_at = CURRENT_TIMESTAMP WHERE game_id = ? AND review_status = 'approved'`).run(game.id);
  });
  await audit(req, 'developer_game_released', { gameId: req.params.gameId });
  res.json({ success: true, message: 'Game released to the Store' });
});

app.post('/api/developer/games/:gameId/releases/:releaseId/release', requireAuth, requireRole('developer'), async (req, res) => {
  const release = await db.prepare(`
    SELECT game_releases.*, games.owner_id, games.title, games.developer, games.price_cents, games.image, games.genre, games.description, games.tags
    FROM game_releases JOIN games ON games.id = game_releases.game_id
    WHERE game_releases.id = ? AND game_releases.game_id = ? AND games.owner_id = ? AND game_releases.review_status = 'approved'
  `).get(req.params.releaseId, req.params.gameId, req.user.id);
  if (!release) return res.status(409).json({ error: 'Only an approved update owned by you can be released.' });
  const changes = release.store_changes || {};
  await transaction(async (tx) => {
    await tx.prepare('UPDATE game_releases SET is_live = FALSE WHERE game_id = ?').run(release.game_id);
    await tx.prepare(`UPDATE game_releases SET review_status = 'released', is_live = TRUE, released_at = CURRENT_TIMESTAMP WHERE id = ?`).run(release.id);
    await tx.prepare(`UPDATE games SET price_cents = ?, image = ?, genre = ?, description = ?, tags = ? WHERE id = ?`).run(
      changes.priceCents ?? release.price_cents,
      changes.image ?? release.image,
      changes.genre ?? release.genre,
      changes.description ?? release.description,
      JSON.stringify(changes.tags ?? release.tags ?? []),
      release.game_id
    );
  });
  await audit(req, 'developer_update_released', { gameId: release.game_id, releaseId: release.id, version: release.version });
  res.json({ success: true, message: `Version ${release.version} is now live` });
});

app.get('/api/admin/reviews', requireAuth, requireRole('admin'), async (req, res) => {
  const rows = await db.prepare(`
    SELECT games.*, users.username AS owner_username
    FROM games LEFT JOIN users ON users.id = games.owner_id
    WHERE games.owner_id IS NOT NULL AND (
      games.publishing_status IN ('pending_review', 'approved', 'rejected')
      OR EXISTS (SELECT 1 FROM game_releases WHERE game_releases.game_id = games.id AND game_releases.review_status = 'pending_review')
    )
    ORDER BY games.submitted_at DESC NULLS LAST
  `).all();
  const games = await Promise.all(rows.map(publishingGame));
  res.json(games.map((game, index) => ({ ...game, ownerUsername: rows[index].owner_username })));
});

app.get('/api/admin/reviews/:gameId/files/:storedName', requireAuth, requireRole('admin'), async (req, res) => {
  const storedName = path.basename(req.params.storedName);
  const file = await db.prepare('SELECT * FROM game_uploads WHERE game_id = ? AND stored_name = ?').get(req.params.gameId, storedName);
  if (!file) return res.status(404).json({ error: 'Review file not found' });
  return res.download(path.join(GAME_UPLOAD_ROOT, file.stored_name), file.original_name);
});

app.post('/api/admin/reviews/:gameId', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = req.body.decision === 'approve' ? 'approved' : req.body.decision === 'reject' ? 'rejected' : null;
  const notes = req.body.notes ? cleanText(req.body.notes, 2000) : null;
  if (!decision || (decision === 'rejected' && !notes)) return res.status(400).json({ error: 'Choose pass or fail and include a reason when failing a game.' });
  const game = await db.prepare(`SELECT id FROM games WHERE id = ? AND publishing_status = 'pending_review'`).get(req.params.gameId);
  if (!game) return res.status(409).json({ error: 'This submission is no longer waiting for review.' });
  await transaction(async (tx) => {
    await tx.prepare(`UPDATE games SET publishing_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(decision, notes, req.user.id, game.id);
    await tx.prepare(`UPDATE game_releases SET review_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE game_id = ? AND review_status = 'pending_review'`).run(decision, notes, req.user.id, game.id);
  });
  await audit(req, `admin_game_${decision}`, { gameId: req.params.gameId, notes });
  res.json({ success: true, publishingStatus: decision });
});

app.post('/api/admin/releases/:releaseId', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = req.body.decision === 'approve' ? 'approved' : req.body.decision === 'reject' ? 'rejected' : null;
  const notes = req.body.notes ? cleanText(req.body.notes, 2000) : null;
  if (!decision || (decision === 'rejected' && !notes)) return res.status(400).json({ error: 'Choose pass or fail and include a reason when failing an update.' });
  const result = await db.prepare(`
    UPDATE game_releases SET review_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND review_status = 'pending_review'
  `).run(decision, notes, req.user.id, req.params.releaseId);
  if (!result.changes) return res.status(409).json({ error: 'This update is no longer waiting for review.' });
  await audit(req, `admin_update_${decision}`, { releaseId: req.params.releaseId, notes });
  res.json({ success: true, reviewStatus: decision });
});

app.post('/api/payments/methods', requireAuth, async (req, res) => {
  const provider = cleanText(req.body.provider, 40);
  const providerCustomerId = cleanText(req.body.providerCustomerId, 120);
  const providerPaymentMethodId = cleanText(req.body.providerPaymentMethodId, 120);
  const brand = req.body.brand ? cleanText(req.body.brand, 40) : null;
  const last4 = typeof req.body.last4 === 'string' && /^\d{4}$/.test(req.body.last4) ? req.body.last4 : null;

  if (!provider || !providerCustomerId || !providerPaymentMethodId) {
    return res.status(400).json({ error: 'Use a payment provider token. Raw card data is not accepted.' });
  }

  await db.prepare(`
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

  await audit(req, 'payment_method_added', { provider, brand, last4 });
  res.status(201).json({ success: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
