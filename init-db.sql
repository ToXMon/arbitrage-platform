-- PostgreSQL initialization script for Arbitrage Platform
-- This runs automatically when the postgres container starts for the first time.

CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    expected_profit TEXT NOT NULL,
    profit_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
    dex_path TEXT NOT NULL,
    chain TEXT NOT NULL,
    block_number BIGINT NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT REFERENCES opportunities(id),
    bot_id TEXT REFERENCES bots(id),
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    amount_out TEXT NOT NULL,
    profit TEXT NOT NULL DEFAULT '0',
    gas_used TEXT NOT NULL DEFAULT '0',
    gas_price TEXT NOT NULL DEFAULT '0',
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    chain TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_opportunities_chain ON opportunities(chain);
CREATE INDEX IF NOT EXISTS idx_opportunities_timestamp ON opportunities(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_chain ON trades(chain);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_bot_id ON trades(bot_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
