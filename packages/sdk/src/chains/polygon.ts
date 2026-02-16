/**
 * Polygon (Matic) chain configuration
 * @module chains/polygon
 */

import type { ChainConfig } from './types';

/**
 * Polygon configuration
 * Chain ID: 137
 */
export const polygon: ChainConfig = {
  chainId: 137,
  name: 'Polygon',
  rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Polygonscan',
    url: 'https://polygonscan.com',
    apiUrl: 'https://api.polygonscan.com/api',
  },
  supportedDexes: [
    'uniswap-v3',
    'sushiswap',
    'quickswap',
    'curve',
    'balancer',
  ],
  addresses: {
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    multicall: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
};

export default polygon;
