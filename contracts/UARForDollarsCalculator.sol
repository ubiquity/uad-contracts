// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUARForDollarsCalculator.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./libs/ABDKMathQuad.sol";
import "./DebtCoupon.sol";
import "hardhat/console.sol";

/// @title Uses the following formula: ((1/(1-R)^2) - 1)
contract UARForDollarsCalculator is IUARForDollarsCalculator {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;
    UbiquityAlgorithmicDollarManager public manager;
    bytes16 private immutable _coef = (uint256(1)).fromUInt();

    /// @param _manager the address of the manager/config contract so we can fetch variables
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    // dollarsToBurn * (blockheight_debt/blockheight_burn) * _coef
    function getUARAmount(uint256 dollarsToBurn, uint256 blockHeightDebt)
        external
        view
        override
        returns (uint256)
    {
        console.log(
            "## getUARAmount dollarsToBurn:%s blockHeightDebt:%s",
            dollarsToBurn,
            blockHeightDebt
        );
        require(
            DebtCoupon(manager.debtCouponAddress()).getTotalOutstandingDebt() <
                IERC20(manager.uADTokenAddress()).totalSupply(),
            "uAR4Dollar: DEBT_TOO_HIGH"
        );
        bytes16 curBlock = uint256(block.number).fromUInt();
        bytes16 multiplier = blockHeightDebt.fromUInt().div(curBlock);
        bytes16 op = multiplier.exp(_coef);
        uint256 res = dollarsToBurn.fromUInt().mul(op).toUInt();

        console.log("## getUARAmount curBlock:%s res:%s ", curBlock, res);
        return res;
    }
}
