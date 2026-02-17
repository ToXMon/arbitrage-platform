/**
 * @fileoverview Aave V3 Pool ABI for flash loan operations
 */

export const AAVE_V3_POOL_ABI = [
  // Flash loan simple
  'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external',
  
  // View functions
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
  
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  
  // Constants
  'function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128)',
] as const;

export const AAVE_V3_POOL_ADDRESSES_PROVIDER_ABI = [
  'function getPool() external view returns (address)',
  'function getPoolDataProvider() external view returns (address)',
  'function getPriceOracle() external view returns (address)',
] as const;

/**
 * Aave V3 mainnet addresses
 */
export const AAVE_V3_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    flashLoanPremium: 9, // 0.09% (9 basis points)
  },
  // Arbitrum
  42161: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0E402dC232d5A977953DF7ECBb5046A',
    flashLoanPremium: 9,
  },
  // Optimism
  10: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0E402dC232d5A977953DF7ECBb5046A',
    flashLoanPremium: 9,
  },
  // Polygon
  137: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0E402dC232d5A977953DF7ECBb5046A',
    flashLoanPremium: 9,
  },
  // Base
  8453: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    flashLoanPremium: 9,
  },
  // Avalanche
  43114: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0E402dC232d5A977953DF7ECBb5046A',
    flashLoanPremium: 9,
  },
} as const;

export type AaveV3ChainId = keyof typeof AAVE_V3_ADDRESSES;

/**
 * Get Aave V3 addresses for a specific chain
 */
export function getAaveV3Addresses(chainId: number) {
  if (!(chainId in AAVE_V3_ADDRESSES)) {
    throw new Error(`Aave V3 not supported on chain ${chainId}`);
  }
  return AAVE_V3_ADDRESSES[chainId as AaveV3ChainId];
}
