// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./libs/ABDKMathQuad.sol";

// import "hardhat/console.sol";

library UbiquityFormulas {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;

    // formula duration multiplier
    // uBOND = (1 + 0.001 * weeks^3/2) * uLP
    // D32 = D^3/2
    // S = m * D32 * A + A
    function durationMultiply(
        uint256 _uLP,
        uint256 _weeks,
        uint256 _multiplier
    ) public pure returns (uint256 _uBOND) {
        bytes16 unit = uint256(1 ether).fromUInt();
        bytes16 D = _weeks.fromUInt();
        bytes16 D32 = (D.mul(D).mul(D)).sqrt();
        bytes16 m = _multiplier.fromUInt().div(unit); // 0.0001
        bytes16 A = _uLP.fromUInt();

        _uBOND = m.mul(D32).mul(A).add(A).toUInt();
    }

    // formula bonding
    // UBOND = uLP / currentShareValue * TARGET_PRICE
    // newShares = A / V * T
    function bonding(
        uint256 _uLP,
        uint256 _currentShareValue,
        uint256 _targetPrice
    ) public pure returns (uint256 _uBOND) {
        bytes16 A = _uLP.fromUInt();
        bytes16 V = _currentShareValue.fromUInt();
        bytes16 T = _targetPrice.fromUInt();

        _uBOND = A.div(V).mul(T).toUInt();
    }

    // formula redeem bonds
    // uLP = uBOND * currentShareValue / TARGET_PRICE
    // tokenAmount = (_sharesAmount * currentShareValue()) / TARGET_PRICE;
    // tokenAmount = A * V / T
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

    // formula bond price
    // SI _totalUBOND = 0  priceBOND = TARGET_PRICE
    // SINON               priceBOND = totalLP / totalShares * TARGET_PRICE
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
