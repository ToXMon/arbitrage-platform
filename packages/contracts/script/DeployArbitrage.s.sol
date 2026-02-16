// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Arbitrage.sol";

/**
 * @title DeployArbitrage
 * @notice Deployment script for Arbitrage contract with multi-chain support
 * @dev Usage: forge script script/DeployArbitrage.s.sol:DeployArbitrage --rpc-url $RPC_URL --broadcast
 */
contract DeployArbitrage is Script {
    // Chain-specific Aave PoolAddressesProvider addresses
    address constant AAVE_PROVIDER_MAINNET = 0x2F39D218133EFAB8f2B819b1066C7e434Ad62e85;
    address constant AAVE_PROVIDER_ARBITRUM = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address constant AAVE_PROVIDER_OPTIMISM = 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A;
    address constant AAVE_PROVIDER_BASE = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address constant AAVE_PROVIDER_POLYGON = 0x5343b5bA672Ae99d627A1C87866b8E53F47Db2E6;
    address constant AAVE_PROVIDER_AVALANCHE = 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A;
    address constant AAVE_PROVIDER_FANTOM = 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A;
    address constant AAVE_PROVIDER_BSC = 0xa97684ead0E402Dc232D5A977953dF7ecEB5046A;

    // Balancer Vault (same address on most chains)
    address constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    function run() external returns (address) {
        uint256 chainId = block.chainid;
        
        (address aaveProvider, address balancerVault) = getChainAddresses(chainId);
        
        vm.startBroadcast();
        
        Arbitrage arbitrage = new Arbitrage(
            aaveProvider,
            balancerVault
        );
        
        vm.stopBroadcast();
        
        console.log("Arbitrage deployed at:", address(arbitrage));
        console.log("Chain ID:", chainId);
        console.log("Aave Provider:", aaveProvider);
        console.log("Balancer Vault:", balancerVault);
        
        return address(arbitrage);
    }

    function getChainAddresses(uint256 chainId) public pure returns (address aaveProvider, address balancerVault) {
        if (chainId == 1) {
            // Ethereum Mainnet
            aaveProvider = AAVE_PROVIDER_MAINNET;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 42161) {
            // Arbitrum
            aaveProvider = AAVE_PROVIDER_ARBITRUM;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 10) {
            // Optimism
            aaveProvider = AAVE_PROVIDER_OPTIMISM;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 8453) {
            // Base
            aaveProvider = AAVE_PROVIDER_BASE;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 137) {
            // Polygon
            aaveProvider = AAVE_PROVIDER_POLYGON;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 43114) {
            // Avalanche
            aaveProvider = AAVE_PROVIDER_AVALANCHE;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 250) {
            // Fantom
            aaveProvider = AAVE_PROVIDER_FANTOM;
            balancerVault = BALANCER_VAULT;
        } else if (chainId == 56) {
            // BSC
            aaveProvider = AAVE_PROVIDER_BSC;
            balancerVault = BALANCER_VAULT;
        } else {
            revert("Unsupported chain");
        }
    }
}
