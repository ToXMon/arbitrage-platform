/**
 * Optimism chain configuration
 * @module chains/optimism
 */

import type { ChainConfig } from './types';

/**
 * Optimism configuration
 * Chain ID: 10
 */
export const optimism: ChainConfig = {
  chainId: 10,
  name: 'Optimism',
  rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Optimistic Etherscan',
    url: 'https://optimistic.etherscan.io',
    apiUrl: 'https://api-optimistic.etherscan.io/api',
  },
  supportedDexes: [
    'uniswap-v3',
    'sushiswap',
    'velodrome',
    'curve',
  ],
  addresses: {
    weth: '0x4200000000000000000000000000000000000006',
    multicall: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
};

export default optimism;
