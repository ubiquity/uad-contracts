// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./ERC1155Ubiquity.sol";

contract BondingShare is ERC1155Ubiquity {
    constructor(address _manager) ERC1155Ubiquity(_manager, "URI") {} // solhint-disable-line no-empty-blocks
}
