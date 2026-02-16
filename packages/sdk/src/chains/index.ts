/**
 * Chain configurations module
 * @module chains
 */

export type {
  ChainConfig,
  NativeCurrency,
  BlockExplorer,
  ChainAddresses,
} from './types';

export { ethereum } from './ethereum';
export { arbitrum } from './arbitrum';
export { optimism } from './optimism';
export { base } from './base';
export { polygon } from './polygon';

/**
 * All supported chains mapped by chainId
 */
export const chains: Record<number, import('./types').ChainConfig> = {
  1: require('./ethereum').ethereum,
  42161: require('./arbitrum').arbitrum,
  10: require('./optimism').optimism,
  8453: require('./base').base,
  137: require('./polygon').polygon,
};

/**
 * Get chain configuration by chainId
 * @param chainId - The chain ID
 * @returns Chain configuration or undefined
 */
export function getChain(chainId: number): import('./types').ChainConfig | undefined {
  return chains[chainId];
}

/**
 * Check if a chain is supported
 * @param chainId - The chain ID to check
 * @returns boolean indicating support
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in chains;
}

/**
 * Get all supported chain IDs
 * @returns Array of supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(chains).map(Number);
}
