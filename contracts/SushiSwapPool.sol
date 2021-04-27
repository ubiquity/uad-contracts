// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "hardhat/console.sol";

contract SushiSwapPool {
    IUniswapV2Factory public factory =
        IUniswapV2Factory(0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac);

    UbiquityAlgorithmicDollarManager public manager;
    IUniswapV2Pair public pair;

    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        // check if pair already exist
        address pool =
            factory.getPair(
                manager.uADTokenAddress(),
                manager.uGOVTokenAddress()
            );
        if (pool == address(0)) {
            pool = factory.createPair(
                manager.uADTokenAddress(),
                manager.uGOVTokenAddress()
            );
        }
        pair = IUniswapV2Pair(pool);
    }
}
