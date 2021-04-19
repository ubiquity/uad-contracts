// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.6;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
// import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/ISushiSwapPool.sol";

contract SushiSwapPool is ISushiSwapPool {
    address public factory = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    address public manager;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _manager) public {
        manager = _manager;
    }

    function pairInfo(address tokenA, address tokenB)
        external
        view
        override
        returns (
            uint256 reserveA,
            uint256 reserveB,
            uint256 totalSupply
        )
    {
        IUniswapV2Pair pair =
            IUniswapV2Pair(UniswapV2Library.pairFor(factory, tokenA, tokenB));
        totalSupply = pair.totalSupply();
        (uint256 reserves0, uint256 reserves1, ) = pair.getReserves();
        (reserveA, reserveB) = tokenA == pair.token0()
            ? (reserves0, reserves1)
            : (reserves1, reserves0);
    }
}
