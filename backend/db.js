const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Run `neon env pull` or define it in your backend environment.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

function toPostgresParams(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function buildDb(client = pool) {
  return {
    prepare(sql) {
      const text = toPostgresParams(sql);
      return {
        async get(...params) {
          const result = await client.query(text, params);
          return result.rows[0];
        },
        async all(...params) {
          const result = await client.query(text, params);
          return result.rows;
        },
        async run(...params) {
          const result = await client.query(text, params);
          return { changes: result.rowCount };
        }
      };
    },
    async exec(sql) {
      await client.query(sql);
    }
  };
}

const db = buildDb();

async function transaction(callback) {
  const client = await pool.connect();
  const txDb = buildDb(client);

  try {
    await client.query('BEGIN');
    const result = await callback(txDb);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initDb() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      developer TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      image TEXT,
      genre TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ownership (
      key_id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      owner_id TEXT NOT NULL REFERENCES users(id),
      is_listed_for_sale BOOLEAN NOT NULL DEFAULT FALSE,
      sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fulfilled_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await seed();
}

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

async function seed() {
  const userCount = Number((await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count);
  if (userCount === 0) {
    await db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, email_verified, mfa_enabled)
      VALUES (?, ?, ?, ?, ?, TRUE, TRUE)
    `).run('user1', 'Gamer123', 'gamer@example.com', bcrypt.hashSync('ChangeMe123!', 12), 'developer');
  }

  const gameCount = Number((await db.prepare('SELECT COUNT(*) AS count FROM games').get()).count);
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

  const defaultHash = bcrypt.hashSync(uuidv4(), 12);

  await transaction(async (tx) => {
    const insertGame = tx.prepare('INSERT INTO games (id, title, developer, price_cents, image, genre) VALUES (?, ?, ?, ?, ?, ?)');
    const insertOwner = tx.prepare('INSERT INTO ownership (key_id, game_id, owner_id, is_listed_for_sale, sale_price_cents) VALUES (?, ?, ?, ?, ?)');
    const insertUser = tx.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING');

    for (const game of games) await insertGame.run(...game);
    await insertOwner.run('key-123', 'game1', 'user1', false, null);
    await insertOwner.run('key-456', 'game2', 'user1', false, null);

    for (let i = 0; i < 20; i += 1) {
      const randomUser = `randomUser${i}`;
      const randomGame = games[Math.floor(Math.random() * games.length)][0];
      const priceCents = Math.round((Math.random() * 30 + 1) * 100);
      await insertUser.run(randomUser, randomUser, `${randomUser}@example.com`, defaultHash);
      await insertOwner.run(`test-key-${i}`, randomGame, randomUser, true, priceCents);
    }
  });
}

module.exports = {
  db,
  transaction,
  initDb,
  centsToGame,
  uuidv4
};
