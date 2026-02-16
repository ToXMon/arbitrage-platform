import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Bot management table
export const bots = sqliteTable('bots', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  chain: text('chain').notNull(),
  status: text('status', { enum: ['idle', 'running', 'paused', 'error'] }).notNull().default('idle'),
  config: text('config', { mode: 'json' }).notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Arbitrage opportunities table
export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  tokenIn: text('token_in').notNull(),
  tokenOut: text('token_out').notNull(),
  amountIn: text('amount_in').notNull(),
  expectedProfit: text('expected_profit').notNull(),
  profitPercent: real('profit_percent').notNull(),
  dexPath: text('dex_path', { mode: 'json' }).notNull(),
  chain: text('chain').notNull(),
  blockNumber: integer('block_number').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  executed: integer('executed', { mode: 'boolean' }).notNull().default(false),
});

// Trade history table
export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').references(() => opportunities.id),
  botId: text('bot_id').references(() => bots.id),
  tokenIn: text('token_in').notNull(),
  tokenOut: text('token_out').notNull(),
  amountIn: text('amount_in').notNull(),
  amountOut: text('amount_out').notNull(),
  profit: text('profit').notNull(),
  gasUsed: text('gas_used').notNull(),
  gasPrice: text('gas_price').notNull(),
  txHash: text('tx_hash'),
  status: text('status', { enum: ['pending', 'submitted', 'confirmed', 'failed'] }).notNull().default('pending'),
  chain: text('chain').notNull(),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
});

// Type exports for Drizzle
export type BotRow = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type OpportunityRow = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type TradeRow = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
