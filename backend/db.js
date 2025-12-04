const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'privacykit.db');
let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create links table with INTEGER timestamps (Unix ms)
  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_url TEXT NOT NULL,
      short_code TEXT UNIQUE NOT NULL,
      max_clicks INTEGER,
      click_count INTEGER DEFAULT 0,
      expires_at INTEGER,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  // Create index for faster lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_short_code ON links(short_code)`);

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDatabase() {
  return db;
}

module.exports = { initDatabase, getDatabase, saveDatabase };
