// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./BondingShareV2.sol";
import "./libs/ABDKMathQuad.sol";

import "./interfaces/IMasterChefV2.sol";

contract BondingFormulas {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;

    uint256 public constant ONE = uint256(1 ether); //   18 decimals

    /// @dev formula UBQ Rights corresponding to a bonding shares LP amount
    /// @param _bond , bonding share
    /// @param _amount , amount of LP tokens
    /// @notice shares = (bond.shares * _amount )  / bond.lpAmount ;
    function sharesForLP(
        BondingShareV2.Bond memory _bond,
        uint256[2] memory _shareInfo,
        uint256 _amount
    ) public pure returns (uint256 _uLP) {
        bytes16 a = _shareInfo[0].fromUInt(); // shares amount
        bytes16 v = _amount.fromUInt();
        bytes16 t = _bond.lpAmount.fromUInt();

        _uLP = a.mul(v).div(t).toUInt();
    }

    /// @dev formula may add a decreasing rewards if locking end is near
    /// @param _bond , bonding share
    /// @param _amount , amount of LP tokens
    /// @notice rewards = _amount;
    function LpRewardsNormalization(
        BondingShareV2.Bond memory _bond,
        uint256[2] memory _shareInfo,
        uint256 _amount
    ) public pure returns (uint256) {
        return _amount;
    }
}
