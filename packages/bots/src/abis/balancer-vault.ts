/**
 * @fileoverview Balancer V2 Vault ABI for swap operations
 */

export const BALANCER_VAULT_ABI = [
  // Swap functions
  'function swap(tuple(bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData) singleSwap, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, uint256 limit, uint256 deadline) external payable returns (uint256)',
  
  'function batchSwap(uint8 kind, tuple(bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)[] swaps, address[] assets, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, int256[] limits, uint256 deadline) external payable returns (int256[] assetDeltas)',
  
  // Flash loan
  'function flashLoan(address recipient, address[] tokens, uint256[] amounts, bytes userData) external',
  
  // Pool queries
  'function getPool(bytes32 poolId) external view returns (address, uint8)',
  'function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
  
  // Events
  'event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event FlashLoan(address indexed recipient, address indexed token, uint256 amount, uint256 feeAmount)',
] as const;

/**
 * Balancer Pool ABI (common across pool types)
 */
export const BALANCER_POOL_ABI = [
  'function getPoolId() external view returns (bytes32)',
  'function getVault() external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'function getRate() external view returns (uint256)',
  'function getScalingFactors() external view returns (uint256[])',
  'function getNormalizedWeights() external view returns (uint256[])', // Weighted pools
  'function getAmplificationParameter() external view returns (uint256 value, bool isUpdating, uint256 precision)', // Stable pools
] as const;

/**
 * Balancer V2 Vault addresses by chain
 */
export const BALANCER_VAULT_ADDRESSES = {
  // Ethereum Mainnet
  1: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  // Arbitrum
  42161: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  // Optimism
  10: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  // Polygon
  137: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  // Base
  8453: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  // Avalanche
  43114: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
} as const;

/**
 * Balancer pool types
 */
export enum BalancerPoolType {
  WEIGHTED = 'Weighted',
  STABLE = 'Stable',
  META_STABLE = 'MetaStable',
  COMPOSABLE_STABLE = 'ComposableStable',
  LIQUIDITY_BOOTSTRAPPING = 'LiquidityBootstrapping',
  MANAGED = 'Managed',
}

/**
 * Swap kind enum
 */
export enum SwapKind {
  GIVEN_IN = 0,
  GIVEN_OUT = 1,
}

/**
 * Get Balancer Vault address for chain
 */
export function getBalancerVaultAddress(chainId: number): string {
  if (!(chainId in BALANCER_VAULT_ADDRESSES)) {
    throw new Error(`Balancer Vault not deployed on chain ${chainId}`);
  }
  return BALANCER_VAULT_ADDRESSES[chainId as keyof typeof BALANCER_VAULT_ADDRESSES];
}
