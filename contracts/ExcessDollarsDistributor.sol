// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "hardhat/console.sol";
import "./interfaces/IExcessDollarsDistributor.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./UbiquityAlgorithmicDollar.sol";

/// @title An excess dollar distributor which sends dollars to treasury,
/// lp rewards and inflation rewards
contract ExcessDollarsDistributor is IExcessDollarsDistributor {
    using SafeMath for uint256;
    UbiquityAlgorithmicDollarManager public manager;

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
        address treasuryAddress = address(0);
        address inflationRewardsAddress = address(0);
        address lpRewardsAddress = address(0);

        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            treasuryAddress,
            excessDollars.div(10)
        );

        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            inflationRewardsAddress,
            excessDollars.mul(55).div(100)
        );

        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
            lpRewardsAddress,
            excessDollars.mul(35).div(100)
        );
    }
}
