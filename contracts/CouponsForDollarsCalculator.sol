// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICouponsForDollarsCalculator.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./libs/ABDKMath64x64.sol";
import "./libs/ABDKMathQuad.sol";
import "./DebtCoupon.sol";
import "hardhat/console.sol";

/// @title Uses the following formula: ((1/(1-R)^2) - 1)
contract CouponsForDollarsCalculator is ICouponsForDollarsCalculator {
    UbiquityAlgorithmicDollarManager public manager;
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;

    /*   using ABDKMath64x64 for uint256;
    using ABDKMath64x64 for int128;*/

    /// @param _manager the address of the manager/config contract so we can fetch variables
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    function getCouponAmount(uint256 dollarsToBurn)
        external
        view
        override
        returns (uint256)
    {
        require(
            DebtCoupon(manager.debtCouponAddress()).getTotalOutstandingDebt() <
                IERC20(manager.uADTokenAddress()).totalSupply(),
            "coupon4Dollar: DEBT_TOO_HIGH"
        );
        // ABDKMathQuad get 52414814814814820000 instead of 52414814814814814809
        bytes16 one = uint256(1).fromUInt();
        bytes16 totalDebt =
            DebtCoupon(manager.debtCouponAddress())
                .getTotalOutstandingDebt()
                .fromUInt();
        console.logBytes16(totalDebt);
        bytes16 r =
            totalDebt.div(
                IERC20(manager.uADTokenAddress()).totalSupply().fromUInt()
            );
        console.logBytes16(r);

        bytes16 oneMinusRAllSquared = (one.sub(r)).mul(one.sub(r));
        console.logBytes16(oneMinusRAllSquared);

        bytes16 res = one.div(oneMinusRAllSquared);
        console.logBytes16(res);

        return res.mul(dollarsToBurn.fromUInt()).toUInt();
        // ABDKMath64x64 get 52414814814814820000 instead of 52414814814814814809
        /*     int128 one = uint256(1).fromUInt();
        uint256 totalDebt =
            DebtCoupon(manager.debtCouponAddress()).getTotalOutstandingDebt();
        console.log(
            "##getCouponAmount totalDebt:%s  totalSupply:%s dollartoBurn:%s",
            totalDebt,
            IERC20(manager.uADTokenAddress()).totalSupply(),
            dollarsToBurn
        );
        int128 r =
            totalDebt.divu(IERC20(manager.uADTokenAddress()).totalSupply());
        console.logInt(r);

        int128 oneMinusRAllSquared = (one.sub(r)).pow(2);
        console.logInt(oneMinusRAllSquared);
        console.log(
            "##getCouponAmount r:%s  oneMinusRAllSquared:%s",
            r.mulu(uint256(100)),
            oneMinusRAllSquared.mulu(uint256(100))
        );

        int128 res = (oneMinusRAllSquared.inv()).sub(one);
        console.logInt(res);

        return dollarsToBurn + res.mulu(dollarsToBurn); */
        //normal
        /*  uint256 r =
            (totalDebt * 100) /
                (IERC20(manager.uADTokenAddress()).totalSupply());
        uint256 oneMinusRAllSquared = (((one) - (r))**2) / 100; */
        // uint256 oneMinusRAllSquared = ((one).sub(r)).mul((one).sub(r));
        /*    console.log(
            "##getCouponAmount r:%s  oneMinusRAllSquared:%s",
            r,
            oneMinusRAllSquared
        ); */
        //rewards per dollar is ( (1/(1-R)^2) - 1)
        /*   return
            (dollarsToBurn +
                dollarsToBurn *
                (10**8 / oneMinusRAllSquared) -
                10**6) / 10**6; */
    }
}
