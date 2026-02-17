import { z } from 'zod';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
  timestamp?: number;
}

export interface Bot {
  id: string;
  name: string;
  chain: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface Opportunity {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  expectedProfit: string;
  profitPercent: number;
  dexPath: unknown;
  chain: string;
  blockNumber: number;
  timestamp: Date;
  executed: boolean;
}

export interface Trade {
  id: string;
  opportunityId: string | null;
  botId: string | null;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  profit: string;
  gasUsed: string;
  gasPrice: string;
  txHash: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  chain: string;
  error: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
}

export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export const CreateBotSchema = z.object({
  name: z.string().min(1).max(100),
  chain: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateBotSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    chain: z.string().min(1).optional(),
    status: z.enum(['idle', 'running', 'paused', 'error']).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const OpportunityQuerySchema = z.object({
  chain: z.string().optional(),
  minProfit: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const TradeQuerySchema = z.object({
  chain: z.string().optional(),
  botId: z.string().optional(),
  status: z.enum(['pending', 'submitted', 'confirmed', 'failed']).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ExecuteTradeSchema = z.object({
  opportunityId: z.string().min(1),
  botId: z.string().min(1),
  maxGasPrice: z.string().optional(),
  slippageTolerance: z.coerce.number().min(0).max(100).optional(),
});

export type CreateBot = z.infer<typeof CreateBotSchema>;
export type UpdateBot = z.infer<typeof UpdateBotSchema>;
export type OpportunityQuery = z.infer<typeof OpportunityQuerySchema>;
export type TradeQuery = z.infer<typeof TradeQuerySchema>;
export type ExecuteTrade = z.infer<typeof ExecuteTradeSchema>;

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  minProfitUSD: number;
  maxTradeSizeUSD: number;
  maxGasPriceGwei: number;
}

export interface BotConfig {
  botId: string;
  chainId: number;
  privateKey: string;
  strategies: StrategyConfig[];
  monitors: unknown[];
}

export interface ArbitrageOpportunity {
  id: string;
  route: {
    chainId: number;
  };
  profitUSD: number;
  timestamp: number;
}

export interface TradeExecution {
  opportunityId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed' | 'reverted';
  timestamp: number;
  profit?: bigint;
  error?: string;
}
