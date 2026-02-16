/**
 * Chain configuration types
 * @module chains/types
 */

/**
 * Native currency configuration
 */
export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Block explorer configuration
 */
export interface BlockExplorer {
  name: string;
  url: string;
  apiUrl: string;
}

/**
 * Common contract addresses for a chain
 */
export interface ChainAddresses {
  weth: `0x${string}`;
  multicall: `0x${string}`;
  usdc?: `0x${string}`;
  usdt?: `0x${string}`;
  router?: `0x${string}`;
}

/**
 * Complete chain configuration
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: NativeCurrency;
  blockExplorer: BlockExplorer;
  supportedDexes: string[];
  addresses: ChainAddresses;
}
