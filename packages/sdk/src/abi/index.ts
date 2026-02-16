/**
 * Contract ABIs for the arbitrage platform
 * These will be populated from compiled contracts in packages/contracts
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

// WETH ABI
export const WETH_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
] as const;

// Arbitrage contract ABI (placeholder - will be updated after contract compilation)
export const ARBITRAGE_ABI = [
  'function executeArbitrage(address tokenBorrow, uint256 amountBorrow, tuple(address[] path, uint24[] fees) swapPath1, tuple(address[] path, uint24[] fees) swapPath2) external',
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function pause() external',
  'function unpause() external',
  'function withdraw(address token, uint256 amount) external',
  'function rescueETH(uint256 amount) external',
  'event ArbitrageExecuted(address indexed executor, address indexed tokenBorrow, uint256 amountBorrow, uint256 profit, uint256 gasUsed)',
  'event Paused(address account)',
  'event Unpaused(address account)',
] as const;

// Type exports
export type ERC20 = typeof ERC20_ABI;
export type UniswapV3Pool = typeof UNISWAP_V3_POOL_ABI;
export type UniswapV3Quoter = typeof UNISWAP_V3_QUOTER_ABI;
export type WETH = typeof WETH_ABI;
export type Arbitrage = typeof ARBITRAGE_ABI;
