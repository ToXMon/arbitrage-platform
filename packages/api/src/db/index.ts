import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

const sqliteDb = new Database('data/arbitrage.db');

// Ensure required tables exist for local/dev startup on a fresh DB.
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    config TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    expected_profit TEXT NOT NULL,
    profit_percent REAL NOT NULL,
    dex_path TEXT NOT NULL,
    chain TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    executed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT REFERENCES opportunities(id),
    bot_id TEXT REFERENCES bots(id),
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    amount_out TEXT NOT NULL,
    profit TEXT NOT NULL,
    gas_used TEXT NOT NULL,
    gas_price TEXT NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    chain TEXT NOT NULL,
    error TEXT,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER
  );
`);

export const db = drizzle(sqliteDb, { schema });

// Helper to close connection gracefully
export const closeDb = (): void => {
  sqliteDb.close();
};

// Test database connection
export const testConnection = (): boolean => {
  try {
    sqliteDb.exec('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
};

export { schema };
