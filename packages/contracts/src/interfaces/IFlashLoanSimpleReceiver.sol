// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";

/**
 * @title IFlashLoanSimpleReceiver
 * @author Aave
 * @notice Defines the basic interface of a flashloan-receiver contract.
 * @dev Implement this interface to develop a flashloan-compatible flashLoanReceiver contract
 */
interface IFlashLoanSimpleReceiver {
    /**
     * @notice Executes an operation after receiving the flashloaned assets
     * @dev Ensure that the contract can return the debt + premium, i.e., has
     * enough funds to pay and has approved the Pool to pull the total amount
     * @param asset The address of the flashloaned asset
     * @param amount The amount of the flashloaned asset
     * @param premium The fee of the flashloan
     * @param initiator The initiator of the flashloan
     * @param params The byte-encoded params passed when initiating the flashloan
     * @return True if the execution of the operation succeeds, false otherwise
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
