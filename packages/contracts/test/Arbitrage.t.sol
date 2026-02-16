// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Arbitrage.sol";

/**
 * @title ArbitrageTest
 * @notice Basic tests for Arbitrage contract
 */
contract ArbitrageTest is Test {
    Arbitrage public arbitrage;
    
    // Test addresses
    address constant AAVE_PROVIDER = 0x2F39D218133EFAB8f2B819b1066C7e434Ad62e85;
    address constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public owner = address(0x1);
    address public user = address(0x2);
    
    function setUp() public {
        vm.startPrank(owner);
        arbitrage = new Arbitrage(AAVE_PROVIDER, BALANCER_VAULT);
        vm.stopPrank();
    }
    
    function test_OwnerIsSet() public view {
        assertEq(arbitrage.owner(), owner);
    }
    
    function test_ChainIdIsSet() public view {
        assertEq(arbitrage.CHAIN_ID(), block.chainid);
    }
    
    function test_MinProfitBpsIsSet() public view {
        assertEq(arbitrage.minProfitBps(), 50); // 0.5%
    }
    
    function test_Pause() public {
        vm.prank(owner);
        arbitrage.pause();
        assertTrue(arbitrage.paused());
    }
    
    function test_Unpause() public {
        vm.startPrank(owner);
        arbitrage.pause();
        arbitrage.unpause();
        vm.stopPrank();
        assertFalse(arbitrage.paused());
    }
    
    function test_RevertWhen_NonOwnerPauses() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        arbitrage.pause();
    }
    
    function test_SetAuthorizedCaller() public {
        vm.prank(owner);
        arbitrage.setAuthorizedCaller(user, true);
        assertTrue(arbitrage.authorizedCallers(user));
    }
    
    function test_SetMinProfitBps() public {
        vm.prank(owner);
        arbitrage.setMinProfitBps(100); // 1%
        assertEq(arbitrage.minProfitBps(), 100);
    }
    
    function test_GetChainConfig() public view {
        Arbitrage.ChainConfig memory config = arbitrage.getChainConfig(block.chainid);
        assertEq(config.aaveProvider, AAVE_PROVIDER);
        assertEq(config.balancerVault, BALANCER_VAULT);
        assertTrue(config.isActive);
    }
}
