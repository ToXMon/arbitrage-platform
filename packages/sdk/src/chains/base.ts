/**
 * Base chain configuration
 * @module chains/base
 */

import type { ChainConfig } from './types';

/**
 * Base configuration
 * Chain ID: 8453
 */
export const base: ChainConfig = {
  chainId: 8453,
  name: 'Base',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Basescan',
    url: 'https://basescan.org',
    apiUrl: 'https://api.basescan.org/api',
  },
  supportedDexes: [
    'uniswap-v3',
    'aerodrome',
    'baseswap',
    'sushiswap',
  ],
  addresses: {
    weth: '0x4200000000000000000000000000000000000006',
    multicall: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
};

export default base;
