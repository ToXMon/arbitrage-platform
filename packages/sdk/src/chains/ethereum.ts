/**
 * Ethereum Mainnet chain configuration
 * @module chains/ethereum
 */

import type { ChainConfig } from './types';

/**
 * Ethereum Mainnet configuration
 * Chain ID: 1
 */
export const ethereum: ChainConfig = {
  chainId: 1,
  name: 'Ethereum Mainnet',
  rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.public.blastapi.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Etherscan',
    url: 'https://etherscan.io',
    apiUrl: 'https://api.etherscan.io/api',
  },
  supportedDexes: [
    'uniswap-v3',
    'uniswap-v2',
    'sushiswap',
    'curve',
    'balancer',
  ],
  addresses: {
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    multicall: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
  },
};

export default ethereum;
