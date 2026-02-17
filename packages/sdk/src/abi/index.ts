/**
 * Contract ABIs for the arbitrage platform
 * Generated from packages/contracts/src/Arbitrage.sol
 */

// ERC20 minimal ABI
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;

// Uniswap V3 Pool ABI
export const UNISWAP_V3_POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data) external returns (int256 amount0, int256 amount1)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)',
  'event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)',
  'event Flash(address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1, uint256 paid0, uint256 paid1)',
] as const;

// Uniswap V3 Quoter ABI
export const UNISWAP_V3_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
  'function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)',
] as const;

// Uniswap V3 SwapRouter ABI
export const UNISWAP_V3_SWAPROUTER_ABI = [
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'struct ExactOutputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)',
  'function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn)',
] as const;

// WETH ABI
export const WETH_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
] as const;

// Aave V3 Pool ABI (for flash loans)
export const AAVE_V3_POOL_ABI = [
  'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external',
  'function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)',
] as const;

// Aave V3 PoolAddressesProvider ABI
export const AAVE_V3_PROVIDER_ABI = [
  'function getPool() view returns (address)',
  'function getPoolConfigurator() view returns (address)',
] as const;

// Balancer V2 Vault ABI (for flash loans)
export const BALANCER_V2_VAULT_ABI = [
  'function flashLoan(address recipient, address[] memory tokens, uint256[] memory amounts, bytes memory userData) external',
  'function getPoolTokens(bytes32 poolId) view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock)',
] as const;

/**
 * Arbitrage contract ABI - matches packages/contracts/src/Arbitrage.sol
 * 
 * FlashLoanProvider enum: 0 = AAVE_V3, 1 = BALANCER_V2
 */
export const ARBITRAGE_ABI = [
  // View functions
  'function chainConfigs(uint256 chainId) view returns (address aaveProvider, address balancerVault, bool isActive)',
  'function CHAIN_ID() view returns (uint256)',
  'function authorizedCallers(address) view returns (bool)',
  'function accumulatedProfits(address token) view returns (uint256)',
  'function minProfitBps() view returns (uint256)',
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  
  // Main execution function
  'function executeTrade(address[] calldata _routerPath, address[] calldata _tokenPath, uint24[] calldata _fees, uint256 _flashAmount, uint8 _provider) external',
  
  // Aave V3 flash loan callback
  'function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool)',
  
  // Balancer V2 flash loan callback
  'function receiveFlashLoan(address sender, address[] memory tokens, uint256[] memory amounts, uint256[] memory feeAmounts, bytes memory userData) external',
  
  // Admin functions
  'function pause() external',
  'function unpause() external',
  'function setAuthorizedCaller(address caller, bool authorized) external',
  'function setMinProfitBps(uint256 _minProfitBps) external',
  'function setChainConfig(uint256 chainId, address aaveProvider, address balancerVault) external',
  'function emergencyWithdraw(address token, address to) external',
  'function withdrawProfits(address token) external',
  
  // View functions
  'function getChainConfig(uint256 chainId) external view returns (tuple(address aaveProvider, address balancerVault, bool isActive))',
  'function getAavePool() external view returns (address)',
  
  // Events
  'event FlashLoanExecuted(address indexed provider, address indexed token, uint256 amount, uint256 fee, uint256 timestamp)',
  'event ArbitrageExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 profit, address[] routerPath, uint256 timestamp)',
  'event ProfitRealized(address indexed token, uint256 amount, address indexed recipient, uint256 timestamp)',
  'event EmergencyWithdraw(address indexed token, uint256 amount, address indexed recipient, uint256 timestamp)',
  'event ChainAddressesUpdated(uint256 indexed chainId, address aaveProvider, address balancerVault, uint256 timestamp)',
  'event Paused(address account)',
  'event Unpaused(address account)',
  
  // Errors (for decoding)
  'error InvalidAmount()',
  'error InvalidPath()',
  'error InsufficientProfit()',
  'error FlashLoanFailed()',
  'error UnauthorizedCaller()',
  'error TransferFailed()',
  'error InvalidChain()',
  'error NoProfitToWithdraw()',
] as const;

// Type exports
export type ERC20 = typeof ERC20_ABI;
export type UniswapV3Pool = typeof UNISWAP_V3_POOL_ABI;
export type UniswapV3Quoter = typeof UNISWAP_V3_QUOTER_ABI;
export type UniswapV3SwapRouter = typeof UNISWAP_V3_SWAPROUTER_ABI;
export type WETH = typeof WETH_ABI;
export type AaveV3Pool = typeof AAVE_V3_POOL_ABI;
export type AaveV3Provider = typeof AAVE_V3_PROVIDER_ABI;
export type BalancerV2Vault = typeof BALANCER_V2_VAULT_ABI;
export type Arbitrage = typeof ARBITRAGE_ABI;

/**
 * Flash loan provider enum values
 * Must match the enum in Arbitrage.sol
 */
export const FlashLoanProvider = {
  AAVE_V3: 0,
  BALANCER_V2: 1,
} as const;

export type FlashLoanProviderType = typeof FlashLoanProvider[keyof typeof FlashLoanProvider];
