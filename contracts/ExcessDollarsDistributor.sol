// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "hardhat/console.sol";
import "./interfaces/IExcessDollarsDistributor.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./UbiquityAlgorithmicDollar.sol";
import "./libs/ABDKMathQuad.sol";

/// @title An excess dollar distributor which sends dollars to treasury,
/// lp rewards and inflation rewards
contract ExcessDollarsDistributor is IExcessDollarsDistributor {
    UbiquityAlgorithmicDollarManager public manager;
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;

    /// @param _manager the address of the manager contract so we can fetch variables
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    function distributeDollars() external override {
        //the excess dollars which were sent to this contract by the coupon manager
        uint256 excessDollars =
            UbiquityAlgorithmicDollar(manager.uADTokenAddress()).balanceOf(
                address(this)
            );

        // TODO: put the real addresses in here when these bits are built.
        // they should live in manager...
        address treasuryAddress = manager.treasuryAddress();
        // buy-back and burn uGOV
        address uGovFundAddress = manager.uGovFundAddress();
        // curve uAD-3CRV liquidity pool
        address lpRewardsAddress = manager.lpRewardsAddress();
        uint256 tenPercent =
            excessDollars.fromUInt().div(uint256(10).fromUInt()).toUInt();
        console.log(
            "## * excessDollars:%s tenPercent:%s msg.sender:%s",
            excessDollars,
            tenPercent,
            msg.sender
        );
        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            treasuryAddress,
            tenPercent
        );
        console.log(
            "## * TRASNFER TO treasury:%s tenPercent:%s msg.sender:%s",
            treasuryAddress,
            tenPercent,
            msg.sender
        );
        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            uGovFundAddress,
            tenPercent
        );
        console.log(
            "## * TRASNFER TO uGovFundAddress:%s tenPercent:%s msg.sender:%s",
            uGovFundAddress,
            tenPercent,
            msg.sender
        );
        // TODO should be vested for a certain duration
        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            lpRewardsAddress,
            excessDollars - tenPercent - tenPercent
        );
        console.log(
            "## * TRASNFER TO lpRewardsAddress:%s 80Percent:%s msg.sender:%s",
            lpRewardsAddress,
            excessDollars - tenPercent - tenPercent,
            msg.sender
        );
    }
}
