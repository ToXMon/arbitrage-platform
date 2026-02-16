// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IPool
 * @author Aave
 * @notice Defines the basic interface for an Aave Pool.
 */
interface IPool {
    /**
     * @dev Emitted on flashLoan()
     * @param target The address of the flash loan receiver contract
     * @param initiator The initiator of the flash loan
     *  being flash borrowed
     * @param amount The amount of the asset being flash borrowed
     * @param premium The fee of the flash loan
     */
    event FlashLoan(
        address indexed target,
        address indexed initiator,
        address indexed asset,
        uint256 amount,
        uint256 premium
    );

    /**
     * @notice Allows smartcontracts to access the liquidity of the pool within one transaction,
     * as long as the amount taken plus a fee is returned.
     * @dev For more details see https://docs.aave.com/developers/guides/flash-loans
     * @param receiverAddress The address of the contract receiving the funds
     * @param assets The addresses of the assets being flash-borrowed
     * @param amounts The amounts of the assets being flash-borrowed
     * @param interestRateModes Interest rate modes for the assets being flash-borrowed
     * @param onBehalfOf The address that will receive the debt in case of no return
     * @param params Variadic packed params to pass to the receiver as extra information
     * @param referralCode The referral code for this flash loan
     */
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;

    /**
     * @notice Allows smartcontracts to access the liquidity of the pool within one transaction,
     * as long as the amount taken plus a fee is returned.
     * @dev For more details see https://docs.aave.com/developers/guides/flash-loans
     * @param receiverAddress The address of the contract receiving the funds
     *  being flash-borrowed
     * @param amount The amount of the asset being flash-borrowed
     * @param params Variadic packed params to pass to the receiver as extra information
     * @param referralCode The referral code for this flash loan
     */
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    /**
     * @notice Returns the fee of the flash loan for a given asset
     * 
     * @return The flash loan fee
     */
    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}
