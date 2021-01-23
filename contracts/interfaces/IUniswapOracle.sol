// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

interface IUniswapOracle {
    function update(address tokenA, address tokenB) external;

    function consult(
        address tokenIn,
        uint256 amountIn,
        address tokenOut
    ) external view returns (uint256 amountOut);
}
