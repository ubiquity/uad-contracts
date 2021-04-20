// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "hardhat/console.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/IDollarMintingCalculator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./TWAPOracle.sol";
import "./libs/ABDKMathQuad.sol";

/// @title A mock coupon calculator that always returns a constant
contract DollarMintingCalculator is IDollarMintingCalculator {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;
    bytes16 immutable one = (uint256(1 ether)).fromUInt();
    UbiquityAlgorithmicDollarManager public manager;

    /// @param _manager the address of the manager contract so we can fetch variables
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    function getDollarsToMint() external view override returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        uint256 twapPrice = oracle.consult(manager.uADTokenAddress());
        require(twapPrice > 1, "DollarMintingCalculator: not > 1");
        return
            twapPrice
                .fromUInt()
                .sub(one)
                .mul(
                (
                    IERC20(manager.uADTokenAddress())
                        .totalSupply()
                        .fromUInt()
                        .div(one)
                )
            )
                .toUInt();
    }
}
