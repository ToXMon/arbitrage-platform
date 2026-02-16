// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IBalancerVault
 * @notice Minimal interface for Balancer V2 Vault flash loans
 */
interface IBalancerVault {
    struct FlashLoanInfo {
        uint256 loanFeePercentage;
    }

    function getFlashLoanInfo() external view returns (FlashLoanInfo memory);
    
    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

/**
 * @title IFlashLoanRecipient
 * @notice Interface for Balancer flash loan recipients
 */
interface IFlashLoanRecipient {
    function receiveFlashLoan(
        address sender,
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}
