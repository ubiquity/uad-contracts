// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BondingShare is ERC20 {
    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20("UDDBondingShare", "bUDD") {}
}
