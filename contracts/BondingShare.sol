// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ERC1155Supply.sol";

import "./UbiquityAlgorithmicDollarManager.sol";

contract BondingShare is ERC1155Supply {
    UbiquityAlgorithmicDollarManager public manager;

    constructor(address _manager) ERC1155PresetMinterPauser("URI") {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }
}
