// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "./UbiquityAlgorithmicDollarManager.sol";

contract BondingShare is ERC1155PresetMinterPauser {
    UbiquityAlgorithmicDollarManager public manager;

    //@dev URI param is if we want to add an off-chain meta data uri associated with this contract
    constructor(address _manager) ERC1155PresetMinterPauser("URI") {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }
}
