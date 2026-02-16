/**
 * Opportunity service - business logic for arbitrage opportunities
 */

import type { ArbitrageOpportunity, ApiResponse } from '@arbitrage/sdk';

// In-memory storage (will be replaced with database)
const opportunities: Map<string, ArbitrageOpportunity> = new Map();

export const opportunityService = {
  async getOpportunities(query: {
    chainId?: number;
    minProfit?: number;
    limit: number;
    offset: number;
  }): Promise<ApiResponse<ArbitrageOpportunity[]>> {
    let filtered = Array.from(opportunities.values());

    if (query.chainId) {
      filtered = filtered.filter((o) => o.route.chainId === query.chainId);
    }

    if (query.minProfit) {
      filtered = filtered.filter((o) => o.profitUSD >= query.minProfit!);
    }

    const total = filtered.length;
    const paginated = filtered.slice(query.offset, query.offset + query.limit);

    return {
      success: true,
      data: paginated,
      timestamp: Date.now(),
    };
  },

  async getOpportunityById(id: string): Promise<ArbitrageOpportunity | null> {
    return opportunities.get(id) || null;
  },

  async getRecentOpportunities(limit: number): Promise<ArbitrageOpportunity[]> {
    const all = Array.from(opportunities.values());
    return all
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },

  async getStats(): Promise<{
    total: number;
    avgProfitUSD: number;
    byChain: Record<number, number>;
  }> {
    const all = Array.from(opportunities.values());
    const byChain: Record<number, number> = {};

    all.forEach((o) => {
      const chainId = o.route.chainId;
      byChain[chainId] = (byChain[chainId] || 0) + 1;
    });

    return {
      total: all.length,
      avgProfitUSD: all.length > 0 
        ? all.reduce((sum, o) => sum + o.profitUSD, 0) / all.length 
        : 0,
      byChain,
    };
  },

  async addOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    opportunities.set(opportunity.id, opportunity);
  },
};
