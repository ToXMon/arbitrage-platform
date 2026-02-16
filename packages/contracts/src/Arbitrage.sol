// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolAddressesProvider.sol";
import "./interfaces/IFlashLoanSimpleReceiver.sol";
import "./interfaces/IBalancerVault.sol";
import "./interfaces/IUniswapV3Router.sol";

/**
 * @title Arbitrage
 * @author Arbitrage Platform
 * @notice Production-grade arbitrage contract with multi-chain support,
 *         Aave V3 and Balancer V2 flash loans, and comprehensive security features.
 * @dev Implements Checks-Effects-Interactions pattern with ReentrancyGuard.
 */
contract Arbitrage is
    ReentrancyGuard,
    Pausable,
    Ownable,
    IFlashLoanSimpleReceiver,
    IFlashLoanRecipient
{
    using SafeERC20 for IERC20;

    // ============ ERRORS ============

    error InvalidAmount();
    error InvalidPath();
    error InsufficientProfit();
    error FlashLoanFailed();
    error UnauthorizedCaller();
    error TransferFailed();
    error InvalidChain();
    error NoProfitToWithdraw();

    // ============ EVENTS ============

    /// @dev Emitted when a flash loan is executed
    event FlashLoanExecuted(
        address indexed provider,
        address indexed token,
        uint256 amount,
        uint256 fee,
        uint256 timestamp
    );

    /// @dev Emitted when an arbitrage trade is executed
    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 profit,
        address[] routerPath,
        uint256 timestamp
    );

    /// @dev Emitted when profit is realized and transferred to owner
    event ProfitRealized(
        address indexed token,
        uint256 amount,
        address indexed recipient,
        uint256 timestamp
    );

    /// @dev Emitted when emergency withdraw is executed
    event EmergencyWithdraw(
        address indexed token,
        uint256 amount,
        address indexed recipient,
        uint256 timestamp
    );

    /// @dev Emitted when chain addresses are updated
    event ChainAddressesUpdated(
        uint256 indexed chainId,
        address aaveProvider,
        address balancerVault,
        uint256 timestamp
    );

    // ============ STRUCTS ============

    /**
     * @dev Trade parameters for arbitrage execution
     */
    struct Trade {
        address[] routerPath;     // DEX routers to use
        address[] tokenPath;      // Token path for the trade
        uint24[] fees;            // Pool fees for each leg
        uint256 flashAmount;      // Flash loan amount
        FlashLoanProvider provider; // Which flash loan provider to use
    }

    /**
     * @dev Chain-specific configuration
     */
    struct ChainConfig {
        address aaveProvider;     // Aave PoolAddressesProvider
        address balancerVault;    // Balancer V2 Vault
        bool isActive;            // Is this chain active
    }

    /**
     * @dev Enum for flash loan providers
     */
    enum FlashLoanProvider {
        AAVE_V3,
        BALANCER_V2
    }

    // ============ STATE VARIABLES ============

    // Chain ID => ChainConfig
    mapping(uint256 => ChainConfig) public chainConfigs;

    // Current chain ID (set during construction)
    uint256 public immutable CHAIN_ID;

    // Authorized callers for executing trades (bots)
    mapping(address => bool) public authorizedCallers;

    // Accumulated profits per token
    mapping(address => uint256) public accumulatedProfits;

    // Minimum profit threshold (in basis points, e.g., 100 = 1%)
    uint256 public minProfitBps;

    // ============ CONSTRUCTOR ============

    /**
     * @notice Initialize the arbitrage contract
     * @param _aaveProvider Aave PoolAddressesProvider address for current chain
     * @param _balancerVault Balancer V2 Vault address for current chain
     */
    constructor(
        address _aaveProvider,
        address _balancerVault
    ) Ownable(msg.sender) {
        CHAIN_ID = block.chainid;
        minProfitBps = 50; // 0.5% minimum profit by default
        
        _setChainConfig(CHAIN_ID, _aaveProvider, _balancerVault);
        
        // Pre-configure known chains
        _initializeKnownChains();
    }

    // ============ EXTERNAL FUNCTIONS ============

    /**
     * @notice Execute an arbitrage trade with flash loan
     * @dev Only authorized callers or owner can execute
     * @param _routerPath DEX routers to use for swaps
     * @param _tokenPath Token path for the arbitrage
     * @param _fees Pool fees for each swap leg
     * @param _flashAmount Amount to flash loan
     * @param _provider Flash loan provider to use
     */
    function executeTrade(
        address[] calldata _routerPath,
        address[] calldata _tokenPath,
        uint24[] calldata _fees,
        uint256 _flashAmount,
        FlashLoanProvider _provider
    ) external nonReentrant whenNotPaused {
        // Validation
        if (_flashAmount == 0) revert InvalidAmount();
        if (_routerPath.length == 0 || _tokenPath.length < 2) revert InvalidPath();
        if (_routerPath.length + 1 != _tokenPath.length) revert InvalidPath();
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }

        // Encode trade data
        Trade memory trade = Trade({
            routerPath: _routerPath,
            tokenPath: _tokenPath,
            fees: _fees,
            flashAmount: _flashAmount,
            provider: _provider
        });
        bytes memory data = abi.encode(trade);

        // Execute flash loan based on provider
        if (_provider == FlashLoanProvider.AAVE_V3) {
            _executeAaveFlashLoan(_tokenPath[0], _flashAmount, data);
        } else {
            _executeBalancerFlashLoan(_tokenPath[0], _flashAmount, data);
        }
    }

    /**
     * @notice Aave V3 flash loan callback
     * @dev Called by Aave Pool after sending flash loaned assets
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override nonReentrant returns (bool) {
        ChainConfig storage config = chainConfigs[CHAIN_ID];
        
        // Verify caller is Aave Pool
        address pool = IPoolAddressesProvider(config.aaveProvider).getPool();
        if (msg.sender != pool) revert UnauthorizedCaller();
        if (initiator != address(this)) revert UnauthorizedCaller();

        // Decode trade data
        Trade memory trade = abi.decode(params, (Trade));

        // Execute arbitrage
        _executeArbitrage(trade, amount, premium);

        // Approve repayment to Aave Pool
        uint256 repayment = amount + premium;
        IERC20(asset).forceApprove(pool, repayment);

        emit FlashLoanExecuted(
            config.aaveProvider,
            asset,
            amount,
            premium,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Balancer V2 flash loan callback
     * @dev Called by Balancer Vault after sending flash loaned assets
     */
    function receiveFlashLoan(
        address sender,
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override nonReentrant {
        ChainConfig storage config = chainConfigs[CHAIN_ID];
        
        // Verify caller is Balancer Vault
        if (msg.sender != config.balancerVault) revert UnauthorizedCaller();
        if (sender != address(this)) revert UnauthorizedCaller();

        // Decode trade data
        Trade memory trade = abi.decode(userData, (Trade));
        uint256 flashAmount = amounts[0];
        uint256 fee = feeAmounts[0];

        // Execute arbitrage
        _executeArbitrage(trade, flashAmount, fee);

        // Repay flash loan
        IERC20(tokens[0]).safeTransfer(config.balancerVault, flashAmount + fee);

        emit FlashLoanExecuted(
            config.balancerVault,
            tokens[0],
            flashAmount,
            fee,
            block.timestamp
        );
    }

    /**
     * @notice Emergency withdraw all tokens or specific token
     * @dev Only owner can call, emits EmergencyWithdraw event
     * @param token Token address to withdraw (address(0) for ETH)
     * @param to Recipient address
     */
    function emergencyWithdraw(
        address token,
        address to
    ) external onlyOwner whenPaused {
        uint256 balance;
        
        if (token == address(0)) {
            balance = address(this).balance;
            (bool success, ) = payable(to).call{value: balance}("");
            if (!success) revert TransferFailed();
        } else {
            balance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(to, balance);
        }

        emit EmergencyWithdraw(token, balance, to, block.timestamp);
    }

    /**
     * @notice Withdraw accumulated profits
     * @dev Only owner can call
     * @param token Token address to withdraw profits for
     */
    function withdrawProfits(address token) external onlyOwner {
        uint256 profits = accumulatedProfits[token];
        if (profits == 0) revert NoProfitToWithdraw();
        
        accumulatedProfits[token] = 0;
        IERC20(token).safeTransfer(owner(), profits);
        
        emit ProfitRealized(token, profits, owner(), block.timestamp);
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Pause the contract
     * @dev Only owner can pause
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only owner can unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Add or remove authorized caller
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether to authorize or deauthorize
     */
    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Set minimum profit threshold in basis points
     * @param _minProfitBps Minimum profit in basis points
     */
    function setMinProfitBps(uint256 _minProfitBps) external onlyOwner {
        minProfitBps = _minProfitBps;
    }

    /**
     * @notice Update chain configuration
     * @param chainId Chain ID to update
     * @param aaveProvider Aave PoolAddressesProvider address
     * @param balancerVault Balancer V2 Vault address
     */
    function setChainConfig(
        uint256 chainId,
        address aaveProvider,
        address balancerVault
    ) external onlyOwner {
        _setChainConfig(chainId, aaveProvider, balancerVault);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get chain configuration
     * @param chainId Chain ID to query
     */
    function getChainConfig(
        uint256 chainId
    ) external view returns (ChainConfig memory) {
        return chainConfigs[chainId];
    }

    /**
     * @notice Get current Aave Pool address
     */
    function getAavePool() external view returns (address) {
        return IPoolAddressesProvider(chainConfigs[CHAIN_ID].aaveProvider).getPool();
    }

    // ============ INTERNAL FUNCTIONS ============

    /**
     * @dev Execute Aave V3 flash loan
     */
    function _executeAaveFlashLoan(
        address asset,
        uint256 amount,
        bytes memory data
    ) internal {
        ChainConfig storage config = chainConfigs[CHAIN_ID];
        address pool = IPoolAddressesProvider(config.aaveProvider).getPool();
        
        IPool(pool).flashLoanSimple(
            address(this),
            asset,
            amount,
            data,
            0 // referral code
        );
    }

    /**
     * @dev Execute Balancer V2 flash loan
     */
    function _executeBalancerFlashLoan(
        address asset,
        uint256 amount,
        bytes memory data
    ) internal {
        ChainConfig storage config = chainConfigs[CHAIN_ID];
        
        address[] memory tokens = new address[](1);
        tokens[0] = asset;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        IBalancerVault(config.balancerVault).flashLoan(
            address(this),
            tokens,
            amounts,
            data
        );
    }

    /**
     * @dev Execute the arbitrage trades
     */
    function _executeArbitrage(
        Trade memory trade,
        uint256 flashAmount,
        uint256 fee
    ) internal {
        uint256 initialBalance = IERC20(trade.tokenPath[0]).balanceOf(address(this));
        
        // Execute all swaps in the path
        for (uint256 i = 0; i < trade.routerPath.length; i++) {
            address tokenIn = trade.tokenPath[i];
            address tokenOut = trade.tokenPath[i + 1];
            uint24 swapFee = trade.fees[i];
            
            uint256 amountIn = IERC20(tokenIn).balanceOf(address(this));
            
            // For the last swap, set minimum output to flash amount + fee
            uint256 minOut = (i == trade.routerPath.length - 1) 
                ? flashAmount + fee 
                : 0;
            
            _swapOnV3(
                trade.routerPath[i],
                tokenIn,
                amountIn,
                tokenOut,
                minOut,
                swapFee
            );
        }

        // Calculate profit
        uint256 finalBalance = IERC20(trade.tokenPath[0]).balanceOf(address(this));
        uint256 profit = finalBalance > initialBalance 
            ? finalBalance - initialBalance 
            : 0;

        // Verify minimum profit
        uint256 requiredProfit = (flashAmount * minProfitBps) / 10000;
        if (profit < requiredProfit) revert InsufficientProfit();

        // Track accumulated profits
        if (profit > 0) {
            accumulatedProfits[trade.tokenPath[0]] += profit;
        }

        emit ArbitrageExecuted(
            trade.tokenPath[0],
            trade.tokenPath[trade.tokenPath.length - 1],
            flashAmount,
            finalBalance,
            profit,
            trade.routerPath,
            block.timestamp
        );
    }

    /**
     * @dev Execute swap on Uniswap V3 compatible DEX
     */
    function _swapOnV3(
        address router,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOutMinimum,
        uint24 fee
    ) internal {
        // Approve router
        IERC20(tokenIn).forceApprove(router, amountIn);
        
        // Setup swap parameters
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            });

        // Execute swap
        ISwapRouter(router).exactInputSingle(params);
    }

    /**
     * @dev Set chain configuration
     */
    function _setChainConfig(
        uint256 chainId,
        address aaveProvider,
        address balancerVault
    ) internal {
        chainConfigs[chainId] = ChainConfig({
            aaveProvider: aaveProvider,
            balancerVault: balancerVault,
            isActive: true
        });
        
        emit ChainAddressesUpdated(
            chainId,
            aaveProvider,
            balancerVault,
            block.timestamp
        );
    }

    /**
     * @dev Initialize known chain configurations
     */
    function _initializeKnownChains() internal {
        // Ethereum Mainnet
        if (CHAIN_ID != 1) {
            chainConfigs[1] = ChainConfig({
                aaveProvider: 0x2F39D218133EFAB8f2B819b1066C7e434Ad62e85,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
        
        // Arbitrum
        if (CHAIN_ID != 42161) {
            chainConfigs[42161] = ChainConfig({
                aaveProvider: 0x794a61358D6845594F94dc1DB02A252b5b4814aD,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
        
        // Optimism
        if (CHAIN_ID != 10) {
            chainConfigs[10] = ChainConfig({
                aaveProvider: 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
        
        // Base
        if (CHAIN_ID != 8453) {
            chainConfigs[8453] = ChainConfig({
                aaveProvider: 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
        
        // Polygon
        if (CHAIN_ID != 137) {
            chainConfigs[137] = ChainConfig({
                aaveProvider: 0x5343b5bA672Ae99d627A1C87866b8E53F47Db2E6,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
        
        // Avalanche
        if (CHAIN_ID != 43114) {
            chainConfigs[43114] = ChainConfig({
                aaveProvider: 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A,
                balancerVault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
                isActive: true
            });
        }
    }

    // ============ RECEIVE FUNCTION ============

    receive() external payable {}
    fallback() external payable {}
}
