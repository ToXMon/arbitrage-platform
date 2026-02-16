/**
 * Arbitrum One chain configuration
 * @module chains/arbitrum
 */

import type { ChainConfig } from './types';

/**
 * Arbitrum One configuration
 * Chain ID: 42161
 */
export const arbitrum: ChainConfig = {
  chainId: 42161,
  name: 'Arbitrum One',
  rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Arbiscan',
    url: 'https://arbiscan.io',
    apiUrl: 'https://api.arbiscan.io/api',
  },
  supportedDexes: [
    'uniswap-v3',
    'sushiswap',
    'camelot',
    'curve',
    'balancer',
  ],
  addresses: {
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    multicall: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
};

export default arbitrum;
