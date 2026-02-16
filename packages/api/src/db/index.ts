import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

const sqliteDb = new Database('data/arbitrage.db');

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
