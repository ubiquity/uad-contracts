// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICouponsForDollarsCalculator.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./DebtCoupon.sol";

/// @title Uses the following formula: ((1/(1-R)^2) - 1)
contract CouponsForDollarsCalculator is ICouponsForDollarsCalculator {
    using SafeMath for uint256;

    UbiquityAlgorithmicDollarManager public manager;

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
        uint256 one = 1;
        uint256 totalDebt =
            DebtCoupon(manager.debtCouponAddress()).getTotalOutstandingDebt();
        uint256 r =
            totalDebt.div(IERC20(manager.uADTokenAddress()).totalSupply());
        uint256 oneMinusRAllSquared = ((one).sub(r)).mul((one).sub(r));

        //rewards per dollar is ( (1/(1-R)^2) - 1)
        return ((dollarsToBurn).div(oneMinusRAllSquared)).sub(one);
    }
}
