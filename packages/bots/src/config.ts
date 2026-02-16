/**
 * @fileoverview Chain-specific configurations for the arbitrage bot
 * Supports multiple EVM chains with DEX and token configurations
 */

import { ethers } from 'ethers';

/**
 * Supported blockchain networks
 */
export type ChainId = 
  | 1      // Ethereum Mainnet
  | 42161  // Arbitrum One
  | 10     // Optimism
  | 8453   // Base
  | 137    // Polygon
  | 56     // BSC
  | 43114  // Avalanche
  | 250    // Fantom
  | 59144; // Linea

/**
 * DEX configuration interface
 */
export interface DexConfig {
  name: string;
  router: string;
  quoter: string;
  factory: string;
  poolInitCodeHash: string;
}

/**
 * Token configuration interface
 */
export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
}

/**
 * Gas configuration interface
 */
export interface GasConfig {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasPriceMultiplier: number;
}

/**
 * Chain configuration interface
 */
export interface ChainConfig {
  chainId: ChainId;
  name: string;
  rpcUrls: string[];
  wsRpcUrls: string[];
  blockTime: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  dexes: Record<string, DexConfig>;
  tokens: Record<string, TokenConfig>;
  gas: GasConfig;
  explorer: string;
}

/**
 * Common token addresses across chains
 */
export const COMMON_TOKENS: Record<ChainId, Record<string, string>> = {
  1: { // Ethereum
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EescdeCB3F9e74C',
  },
  42161: { // Arbitrum
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  10: { // Optimism
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    OP: '0x4200000000000000000000000000000000000042',
  },
  8453: { // Base
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  137: { // Polygon
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  56: { // BSC
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
  },
  43114: { // Avalanche
    WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
  250: { // Fantom
    WFTM: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    USDC: '0x04068DA6C83AFCFA0e13ba15A66966623388Daf2',
  },
  59144: { // Linea
    WETH: '0xe5D7C2a44FfDDf6b295A15c148167DaAaf5Cf34f',
    USDC: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
  },
};

/**
 * DEX configurations per chain
 */
export const DEX_CONFIGS: Record<ChainId, Record<string, DexConfig>> = {
  1: { // Ethereum
    uniswap: {
      name: 'Uniswap V3',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
    sushiswap: {
      name: 'SushiSwap V3',
      router: '0x2626664c2603336E57B271c5C0b26F421741e481',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  42161: { // Arbitrum
    uniswap: {
      name: 'Uniswap V3',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
    sushiswap: {
      name: 'SushiSwap V3',
      router: '0x1b03dA74Cf54238A732b16F98ee60080E8d8e19d',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  10: { // Optimism
    uniswap: {
      name: 'Uniswap V3',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  8453: { // Base
    uniswap: {
      name: 'Uniswap V3',
      router: '0x2626664c2603336E57B271c5C0b26F421741e481',
      quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
    aerodrome: {
      name: 'Aerodrome',
      router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      quoter: '0x9F49dEf0bBaEc6a402987B52435804a42Faf9aF7',
      factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  137: { // Polygon
    uniswap: {
      name: 'Uniswap V3',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
    quickswap: {
      name: 'QuickSwap V3',
      router: '0xf5b509bB0909a69B1c207E495f687a596C168E12',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  56: { // BSC
    pancakeswap: {
      name: 'PancakeSwap V3',
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E9803e7e8191',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
    uniswap: {
      name: 'Uniswap V3',
      router: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
      quoter: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
      factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  43114: { // Avalanche
    traderjoe: {
      name: 'Trader Joe V3',
      router: '0xbb1a64d29c5B9F64B88d5c5C6F25B2B59291FB6F',
      quoter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      factory: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  250: { // Fantom
    spooky: {
      name: 'SpookySwap V3',
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      quoter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      factory: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
  59144: { // Linea
    uniswap: {
      name: 'Uniswap V3',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F9036087095A53dE9737804e4bD226E9',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },
  },
};

/**
 * Full chain configurations
 */
export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrls: [
      process.env.ETH_RPC ?? 'https://eth.llamarpc.com',
      'https://ethereum.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.ETH_WS_RPC ?? 'wss://ethereum.publicnode.com',
    ],
    blockTime: 12000,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: DEX_CONFIGS[1],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('50', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://etherscan.io',
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrls: [
      process.env.ARB_RPC ?? 'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.ARB_WS_RPC ?? 'wss://arbitrum.publicnode.com',
    ],
    blockTime: 250,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: DEX_CONFIGS[42161],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('0.1', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://arbiscan.io',
  },
  10: {
    chainId: 10,
    name: 'Optimism',
    rpcUrls: [
      process.env.OP_RPC ?? 'https://mainnet.optimism.io',
      'https://optimism.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.OP_WS_RPC ?? 'wss://optimism.publicnode.com',
    ],
    blockTime: 2000,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: DEX_CONFIGS[10],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('0.001', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.0001', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://optimistic.etherscan.io',
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    rpcUrls: [
      process.env.BASE_RPC ?? 'https://mainnet.base.org',
      'https://base.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.BASE_WS_RPC ?? 'wss://base.publicnode.com',
    ],
    blockTime: 2000,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: DEX_CONFIGS[8453],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('0.001', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.0001', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://basescan.org',
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcUrls: [
      process.env.POLYGON_RPC ?? 'https://polygon-rpc.com',
      'https://polygon.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.POLYGON_WS_RPC ?? 'wss://polygon.publicnode.com',
    ],
    blockTime: 2000,
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    dexes: DEX_CONFIGS[137],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('30', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('30', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://polygonscan.com',
  },
  56: {
    chainId: 56,
    name: 'BSC',
    rpcUrls: [
      process.env.BSC_RPC ?? 'https://bsc-dataseed1.binance.org',
      'https://bsc.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.BSC_WS_RPC ?? 'wss://bsc.publicnode.com',
    ],
    blockTime: 3000,
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    dexes: DEX_CONFIGS[56],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('3', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('3', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://bscscan.com',
  },
  43114: {
    chainId: 43114,
    name: 'Avalanche',
    rpcUrls: [
      process.env.AVAX_RPC ?? 'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.AVAX_WS_RPC ?? 'wss://avalanche.publicnode.com',
    ],
    blockTime: 2000,
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    dexes: DEX_CONFIGS[43114],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('25', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('25', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://snowtrace.io',
  },
  250: {
    chainId: 250,
    name: 'Fantom',
    rpcUrls: [
      process.env.FTM_RPC ?? 'https://rpc.ftm.tools',
      'https://fantom.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.FTM_WS_RPC ?? 'wss://fantom.publicnode.com',
    ],
    blockTime: 1000,
    nativeCurrency: { name: 'Fantom', symbol: 'FTM', decimals: 18 },
    dexes: DEX_CONFIGS[250],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('1', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://ftmscan.com',
  },
  59144: {
    chainId: 59144,
    name: 'Linea',
    rpcUrls: [
      process.env.LINEA_RPC ?? 'https://rpc.linea.build',
      'https://linea.publicnode.com',
    ],
    wsRpcUrls: [
      process.env.LINEA_WS_RPC ?? 'wss://linea.publicnode.com',
    ],
    blockTime: 12000,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: DEX_CONFIGS[59144],
    tokens: {},
    gas: {
      gasLimit: 500000n,
      maxFeePerGas: ethers.parseUnits('0.1', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      gasPriceMultiplier: 1.1,
    },
    explorer: 'https://lineascan.build',
  },
};

/**
 * Bot settings
 */
export interface BotSettings {
  priceDifferenceThreshold: number;
  priceUnits: number;
  isDeployed: boolean;
  maxRetries: number;
  retryDelayMs: number;
  executionLockTimeoutMs: number;
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  priceDifferenceThreshold: 0.5,
  priceUnits: 6,
  isDeployed: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  executionLockTimeoutMs: 30000,
};

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

/**
 * Get DEX configuration for a specific chain
 */
export function getDexConfig(chainId: ChainId, dexName: string): DexConfig {
  const chainConfig = getChainConfig(chainId);
  const dexConfig = chainConfig.dexes[dexName.toLowerCase()];
  if (!dexConfig) {
    throw new Error(`DEX ${dexName} not found on chain ${chainId}`);
  }
  return dexConfig;
}

/**
 * Get token configuration
 */
export function getTokenConfig(chainId: ChainId, tokenSymbol: string): TokenConfig {
  const tokenAddress = COMMON_TOKENS[chainId]?.[tokenSymbol.toUpperCase()];
  if (!tokenAddress) {
    throw new Error(`Token ${tokenSymbol} not found on chain ${chainId}`);
  }
  return {
    address: tokenAddress,
    decimals: 18,
    symbol: tokenSymbol.toUpperCase(),
    name: tokenSymbol.toUpperCase(),
  };
}

export default {
  CHAIN_CONFIGS,
  COMMON_TOKENS,
  DEX_CONFIGS,
  DEFAULT_BOT_SETTINGS,
  getChainConfig,
  getDexConfig,
  getTokenConfig,
};
