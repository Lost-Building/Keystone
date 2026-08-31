const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'keystone.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    email_verified INTEGER NOT NULL DEFAULT 0,
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    developer TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    image TEXT,
    genre TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ownership (
    key_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    is_listed_for_sale INTEGER NOT NULL DEFAULT 0,
    sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,
    provider_customer_id TEXT NOT NULL,
    provider_payment_method_id TEXT NOT NULL,
    brand TEXT,
    last4 TEXT,
    expires_month INTEGER,
    expires_year INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_payment_method_id)
  );

  CREATE TABLE IF NOT EXISTS checkout_orders (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    buyer_id TEXT NOT NULL REFERENCES users(id),
    key_id TEXT NOT NULL REFERENCES ownership(key_id),
    seller_id TEXT NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function centsToGame(row) {
  return {
    id: row.id,
    title: row.title,
    developer: row.developer,
    price: row.price_cents / 100,
    image: row.image || undefined,
    genre: row.genre || undefined
  };
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, email_verified, mfa_enabled)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run('user1', 'Gamer123', 'gamer@example.com', bcrypt.hashSync('ChangeMe123!', 12), 'developer');
  }

  const gameCount = db.prepare('SELECT COUNT(*) AS count FROM games').get().count;
  if (gameCount > 0) return;

  const games = [
    ['game1', 'Epic Quest', 'DevStudio', 1999, '/epic_quest.jpg', 'RPG'],
    ['game2', 'Space Explorer', 'Cosmic Games', 999, '/space_explorer.jpg', 'Sci-Fi'],
    ['game3', 'Cyber City', 'Neon Inc', 2999, null, 'Action'],
    ['game4', 'Farm Simulator', 'AgriGames', 1499, null, 'Simulation'],
    ['game5', 'Battle Royale 2050', 'DevStudio', 0, null, 'Shooter'],
    ['game6', 'Puzzle Master', 'Brainy Games', 499, null, 'Puzzle'],
    ['game7', 'Racing Pro', 'Speedster', 3999, null, 'Racing'],
    ['game8', 'Dungeon Crawler', 'DevStudio', 999, null, 'RPG']
  ];

  const insertGame = db.prepare('INSERT INTO games (id, title, developer, price_cents, image, genre) VALUES (?, ?, ?, ?, ?, ?)');
  const insertOwner = db.prepare('INSERT INTO ownership (key_id, game_id, owner_id, is_listed_for_sale, sale_price_cents) VALUES (?, ?, ?, ?, ?)');
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)');
  const defaultHash = bcrypt.hashSync(uuidv4(), 12);

  const seedTx = db.transaction(() => {
    for (const game of games) insertGame.run(...game);
    insertOwner.run('key-123', 'game1', 'user1', 0, null);
    insertOwner.run('key-456', 'game2', 'user1', 0, null);

    for (let i = 0; i < 20; i += 1) {
      const randomUser = `randomUser${i}`;
      const randomGame = games[Math.floor(Math.random() * games.length)][0];
      const priceCents = Math.round((Math.random() * 30 + 1) * 100);
      insertUser.run(randomUser, randomUser, `${randomUser}@example.com`, defaultHash);
      insertOwner.run(`test-key-${i}`, randomGame, randomUser, 1, priceCents);
    }
  });

  seedTx();
}

seed();

module.exports = {
  db,
  centsToGame,
  uuidv4
};
