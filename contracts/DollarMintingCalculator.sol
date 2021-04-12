// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.3;

import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/IDollarMintingCalculator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./TWAPOracle.sol";

/// @title A mock coupon calculator that always returns a constant
contract DollarMintingCalculator is IDollarMintingCalculator {
    UbiquityAlgorithmicDollarManager public manager;

    /// @param _manager the address of the manager contract so we can fetch variables
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    function getDollarsToMint() external view override returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        uint256 twapPrice = oracle.consult(manager.uADTokenAddress());
        return
            twapPrice -
            (1 ether) *
            (IERC20(manager.uADTokenAddress()).totalSupply());
    }
}
