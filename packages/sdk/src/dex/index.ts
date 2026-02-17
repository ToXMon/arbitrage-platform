/**
 * DEX Adapters module
 * @module dex
 */

export type {
  TokenPair,
  PoolInfo,
  QuoteResult,
  PriceInfo,
  DexAdapter,
  FeeTier,
} from './types';

export { FEE_TIERS } from './types';

export { UniswapV3Adapter } from './UniswapV3';
export { SushiSwapAdapter } from './SushiSwap';
export { PancakeSwapV3Adapter } from './PancakeSwapV3';

import type { ChainConfig } from '../chains/types';
import type { DexAdapter } from './types';
import { UniswapV3Adapter } from './UniswapV3';
import { SushiSwapAdapter } from './SushiSwap';
import { PancakeSwapV3Adapter } from './PancakeSwapV3';

/**
 * DEX adapter registry
 */
const adapters: Map<string, new (chain: ChainConfig) => DexAdapter> = new Map<string, new (chain: ChainConfig) => DexAdapter>([
  ['uniswap-v3', UniswapV3Adapter],
  ['sushiswap', SushiSwapAdapter],
  ['pancakeswap-v3', PancakeSwapV3Adapter],
]);

/**
 * Create a DEX adapter instance
 * @param name - DEX name
 * @param chain - Chain configuration
 * @returns DEX adapter instance
 */
export function createAdapter(name: string, chain: ChainConfig): DexAdapter {
  const AdapterClass = adapters.get(name);
  if (!AdapterClass) {
    throw new Error(`Unknown DEX: ${name}. Available: ${Array.from(adapters.keys()).join(', ')}`);
  }
  return new AdapterClass(chain);
}

/**
 * Get all supported DEX names
 */
export function getSupportedDexes(): string[] {
  return Array.from(adapters.keys());
}

/**
 * Create all adapters for a chain
 * @param chain - Chain configuration
 * @returns Array of DEX adapter instances
 */
export function createAllAdapters(chain: ChainConfig): DexAdapter[] {
  const adapters: DexAdapter[] = [];
  
  for (const supportedDex of chain.supportedDexes) {
    try {
      adapters.push(createAdapter(supportedDex, chain));
    } catch {
      // Skip unsupported DEX
    }
  }
  
  return adapters;
}
