// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./ABDKMathQuad.sol";
import "hardhat/console.sol";

library UbiquityFormulas {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;

    /// @dev formula duration multiply
    /// @param _uLP , amount of LP tokens
    /// @param _weeks , mimimun duration of staking period
    /// @param _multiplier , bonding discount multiplier = 0.0001
    /// @return _shares , amount of shares
    /// @notice _shares = (1 + _multiplier * _weeks^3/2) * _uLP
    //          D32 = D^3/2
    //          S = m * D32 * A + A
    function durationMultiply(
        uint256 _uLP,
        uint256 _weeks,
        uint256 _multiplier
    ) public pure returns (uint256 _shares) {
        bytes16 unit = uint256(1 ether).fromUInt();
        bytes16 D = _weeks.fromUInt();
        bytes16 D32 = (D.mul(D).mul(D)).sqrt();
        bytes16 m = _multiplier.fromUInt().div(unit); // 0.0001
        bytes16 A = _uLP.fromUInt();

        _shares = m.mul(D32).mul(A).add(A).toUInt();
    }

    /// @dev formula bonding
    /// @param _shares , amount of shares
    /// @param _currentShareValue , current share value
    /// @param _targetPrice , target uAD price
    /// @return _uBOND , amount of bonding shares
    /// @notice UBOND = _shares / _currentShareValue * _targetPrice
    // newShares = A / V * T
    function bonding(
        uint256 _shares,
        uint256 _currentShareValue,
        uint256 _targetPrice
    ) public pure returns (uint256 _uBOND) {
        bytes16 A = _shares.fromUInt();
        bytes16 V = _currentShareValue.fromUInt();
        bytes16 T = _targetPrice.fromUInt();

        _uBOND = A.div(V).mul(T).toUInt();
    }

    /// @dev formula redeem bonds
    /// @param _uBOND , amount of bonding shares
    /// @param _currentShareValue , current share value
    /// @param _targetPrice , target uAD price
    /// @return _uLP , amount of LP tokens
    /// @notice _uLP = _uBOND * _currentShareValue / _targetPrice
    // _uLP = A * V / T
    function redeemBonds(
        uint256 _uBOND,
        uint256 _currentShareValue,
        uint256 _targetPrice
    ) public pure returns (uint256 _uLP) {
        bytes16 A = _uBOND.fromUInt();
        bytes16 V = _currentShareValue.fromUInt();
        bytes16 T = _targetPrice.fromUInt();

        _uLP = A.mul(V).div(T).toUInt();
    }

    /// @dev formula bond price
    /// @param _totalULP , total LP tokens
    /// @param _totalUBOND , total bond shares
    /// @param _targetPrice ,  target uAD price
    /// @return _priceUBOND , bond share price
    /// @notice
    // IF _totalUBOND = 0  priceBOND = TARGET_PRICE
    // ELSE                priceBOND = totalLP / totalShares * TARGET_PRICE
    // R = T == 0 ? 1 : LP / S
    // P = R * T
    function bondPrice(
        uint256 _totalULP,
        uint256 _totalUBOND,
        uint256 _targetPrice
    ) public pure returns (uint256 _priceUBOND) {
        bytes16 LP = _totalULP.fromUInt();
        bytes16 S = _totalUBOND.fromUInt();
        bytes16 R = _totalUBOND == 0 ? uint256(1).fromUInt() : LP.div(S);
        bytes16 T = _targetPrice.fromUInt();

        _priceUBOND = R.mul(T).toUInt();
    }
}
