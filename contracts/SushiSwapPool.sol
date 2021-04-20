// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

contract SushiSwapPool {
    IUniswapV2Factory public iFactory =
        IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);

    address public manager;
    address public pool;

    constructor(
        address _manager,
        address tokenA,
        address tokenB
    ) {
        manager = _manager;
        pool = iFactory.createPair(tokenA, tokenB);
    }
}
