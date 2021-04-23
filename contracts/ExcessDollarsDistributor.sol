// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IERC20Ubiquity.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IExcessDollarsDistributor.sol";
import "./interfaces/IMetaPool.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./UbiquityAlgorithmicDollar.sol";
import "./libs/ABDKMathQuad.sol";

/// @title An excess dollar distributor which sends dollars to treasury,
/// lp rewards and inflation rewards
contract ExcessDollarsDistributor is IExcessDollarsDistributor {
    using SafeERC20 for IERC20Ubiquity;
    using SafeERC20 for IERC20;
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;
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

        if (excessDollars > 0) {
            address treasuryAddress = manager.treasuryAddress();

            // curve uAD-3CRV liquidity pool
            uint256 tenPercent =
                excessDollars.fromUInt().div(uint256(10).fromUInt()).toUInt();

            UbiquityAlgorithmicDollar(manager.uADTokenAddress()).transfer(
                treasuryAddress,
                tenPercent
            );
            // convert uAD to uGOV-UAD LP on sushi and burn them
            _uGovBuyBackLPAndBurn(tenPercent);
            // convert remaining uAD to curve LP tokens
            // and transfer the curve LP tokens to the bonding contract
            _convertToCurveLPAndTransfer(
                excessDollars - tenPercent - tenPercent
            );
        }
    }

    // buy-back and burn uGOV
    function _uGovBuyBackLPAndBurn(uint256 amount) internal {
        //swap half amount to uGOV
        // we need to approve sushi pool
        // swap uAD=> x uGOV
        // deposit liquidity
        // burn LP token
        // TODO BURN LP  here uad to let the tests pass
        IERC20Ubiquity(manager.uADTokenAddress()).transfer(
            manager.uADTokenAddress(),
            amount
        );
    }

    // @dev convert to curve LP
    // @param amount to convert to curve LP by swapping to 3CRV
    //        and deposit the 3CRV as liquidity to get uAD-3CRV LP tokens
    //        the LP token are sent to the bonding contract
    function _convertToCurveLPAndTransfer(uint256 amount)
        internal
        returns (uint256)
    {
        // we need to approve  metaPool
        IERC20Ubiquity(manager.uADTokenAddress()).safeApprove(
            manager.stableSwapMetaPoolAddress(),
            0
        );
        IERC20Ubiquity(manager.uADTokenAddress()).safeApprove(
            manager.stableSwapMetaPoolAddress(),
            amount
        );

        // swap 3CRV=> x uAD
        uint256 amount3CRVReceived =
            IMetaPool(manager.stableSwapMetaPoolAddress()).exchange(
                0,
                1,
                amount,
                0
            );

        // approve metapool to transfer our 3CRV
        IERC20(manager.curve3PoolTokenAddress()).safeApprove(
            manager.stableSwapMetaPoolAddress(),
            0
        );
        IERC20(manager.curve3PoolTokenAddress()).safeApprove(
            manager.stableSwapMetaPoolAddress(),
            amount3CRVReceived
        );

        // deposit liquidity
        uint256 res =
            IMetaPool(manager.stableSwapMetaPoolAddress()).add_liquidity(
                [0, amount3CRVReceived],
                0,
                manager.bondingContractAddress()
            );
        return res;
    }
}
