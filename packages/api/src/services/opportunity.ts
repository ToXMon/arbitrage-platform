/**
 * Opportunity service - business logic for arbitrage opportunities
 * Uses Drizzle ORM for database persistence
 */

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { ArbitrageOpportunity, ApiResponse } from '../types.js';

const { opportunities } = schema;

/**
 * Convert database row to ArbitrageOpportunity format
 */
function rowToOpportunity(row: typeof opportunities.$inferSelect): ArbitrageOpportunity {
  return {
    id: row.id,
    route: {
      chainId: parseChainId(row.chain),
    },
    profitUSD: row.expectedProfit ? parseFloat(row.expectedProfit) : 0,
    timestamp: row.timestamp ? row.timestamp.getTime() : Date.now(),
  };
}

/**
 * Convert chain name to chainId
 */
function parseChainId(chain: string): number {
  const chainMap: Record<string, number> = {
    'ethereum': 1,
    'mainnet': 1,
    'goerli': 5,
    'sepolia': 11155111,
    'polygon': 137,
    'mumbai': 80001,
    'arbitrum': 42161,
    'arbitrum-goerli': 421613,
    'optimism': 10,
    'optimism-goerli': 420,
    'base': 8453,
    'base-goerli': 84531,
  };
  return chainMap[chain.toLowerCase()] || parseInt(chain) || 1;
}

/**
 * Convert chainId to chain name
 */
function chainIdToName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: 'ethereum',
    5: 'goerli',
    11155111: 'sepolia',
    137: 'polygon',
    80001: 'mumbai',
    42161: 'arbitrum',
    421613: 'arbitrum-goerli',
    10: 'optimism',
    420: 'optimism-goerli',
    8453: 'base',
    84531: 'base-goerli',
  };
  return chainMap[chainId] || chainId.toString();
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `opp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const opportunityService = {
  /**
   * Get opportunities with filtering and pagination
   */
  async getOpportunities(query: {
    chainId?: number;
    minProfit?: number;
    limit: number;
    offset: number;
  }): Promise<ApiResponse<ArbitrageOpportunity[]>> {
    try {
      const conditions = [];
      
      // Filter by chain
      if (query.chainId) {
        const chainName = chainIdToName(query.chainId);
        conditions.push(eq(opportunities.chain, chainName));
      }
      
      // Build query
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Execute query
      const rows = await db
        .select()
        .from(opportunities)
        .where(whereClause)
        .orderBy(desc(opportunities.timestamp))
        .limit(query.limit)
        .offset(query.offset);
      
      // Filter by minProfit in memory (could be done in SQL with cast)
      let filtered = rows.map(rowToOpportunity);
      if (query.minProfit !== undefined) {
        filtered = filtered.filter(o => o.profitUSD >= query.minProfit!);
      }
      
      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(opportunities)
        .where(whereClause);
      
      const total = countResult[0]?.count || 0;

      return {
        success: true,
        data: filtered,
        timestamp: Date.now(),
        meta: {
          total: Number(total),
          limit: query.limit,
          offset: query.offset,
        },
      };
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch opportunities',
          details: error,
        },
        timestamp: Date.now(),
      };
    }
  },

  /**
   * Get single opportunity by ID
   */
  async getOpportunityById(id: string): Promise<ArbitrageOpportunity | null> {
    try {
      const rows = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, id))
        .limit(1);
      
      if (rows.length === 0) {
        return null;
      }
      
      return rowToOpportunity(rows[0]);
    } catch (error) {
      console.error('Error fetching opportunity by ID:', error);
      return null;
    }
  },

  /**
   * Get recent opportunities sorted by timestamp
   */
  async getRecentOpportunities(limit: number): Promise<ArbitrageOpportunity[]> {
    try {
      const rows = await db
        .select()
        .from(opportunities)
        .orderBy(desc(opportunities.timestamp))
        .limit(limit);
      
      return rows.map(rowToOpportunity);
    } catch (error) {
      console.error('Error fetching recent opportunities:', error);
      return [];
    }
  },

  /**
   * Get statistics about opportunities
   */
  async getStats(): Promise<{
    total: number;
    avgProfitUSD: number;
    byChain: Record<number, number>;
  }> {
    try {
      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(opportunities);
      
      const total = Number(countResult[0]?.count || 0);
      
      // Get average profit (stored as TEXT, need to cast)
      const avgResult = await db
        .select({ avg: sql<number>`AVG(CAST(expected_profit AS REAL))` })
        .from(opportunities);
      
      const avgProfitUSD = Number(avgResult[0]?.avg || 0);
      
      // Get counts by chain
      const chainCounts = await db
        .select({
          chain: opportunities.chain,
          count: sql<number>`count(*)`,
        })
        .from(opportunities)
        .groupBy(opportunities.chain);
      
      const byChain: Record<number, number> = {};
      for (const row of chainCounts) {
        const chainId = parseChainId(row.chain);
        byChain[chainId] = Number(row.count);
      }

      return {
        total,
        avgProfitUSD,
        byChain,
      };
    } catch (error) {
      console.error('Error fetching opportunity stats:', error);
      return {
        total: 0,
        avgProfitUSD: 0,
        byChain: {},
      };
    }
  },

  /**
   * Add a new opportunity
   */
  async addOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      const chainName = chainIdToName(opportunity.route.chainId);
      
      await db.insert(opportunities).values({
        id: opportunity.id || generateId(),
        tokenIn: '0x0000000000000000000000000000000000000000', // Would be set from full opportunity data
        tokenOut: '0x0000000000000000000000000000000000000000',
        amountIn: '0',
        expectedProfit: opportunity.profitUSD.toString(),
        profitPercent: 0,
        dexPath: [],
        chain: chainName,
        blockNumber: 0,
        timestamp: new Date(opportunity.timestamp || Date.now()),
        executed: false,
      });
    } catch (error) {
      console.error('Error adding opportunity:', error);
      throw error;
    }
  },

  /**
   * Add opportunity with full data
   */
  async addFullOpportunity(data: {
    id?: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    expectedProfit: string;
    profitPercent: number;
    dexPath: string[];
    chain: string;
    blockNumber: number;
  }): Promise<string> {
    try {
      const id = data.id || generateId();
      
      await db.insert(opportunities).values({
        id,
        tokenIn: data.tokenIn,
        tokenOut: data.tokenOut,
        amountIn: data.amountIn,
        expectedProfit: data.expectedProfit,
        profitPercent: data.profitPercent,
        dexPath: data.dexPath,
        chain: data.chain,
        blockNumber: data.blockNumber,
        timestamp: new Date(),
        executed: false,
      });
      
      return id;
    } catch (error) {
      console.error('Error adding full opportunity:', error);
      throw error;
    }
  },

  /**
   * Mark opportunity as executed
   */
  async markExecuted(id: string): Promise<boolean> {
    try {
      const result = await db
        .update(opportunities)
        .set({ executed: true })
        .where(eq(opportunities.id, id));
      
      return true;
    } catch (error) {
      console.error('Error marking opportunity as executed:', error);
      return false;
    }
  },

  /**
   * Delete old opportunities (cleanup)
   */
  async deleteOlderThan(days: number): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const result = await db
        .delete(opportunities)
        .where(sql`timestamp < ${cutoff.getTime()}`);
      
      return Number(result.changes || 0);
    } catch (error) {
      console.error('Error deleting old opportunities:', error);
      return 0;
    }
  },
};
