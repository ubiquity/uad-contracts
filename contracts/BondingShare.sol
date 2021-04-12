// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract BondingShare is ERC20PresetMinterPauser {
    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20PresetMinterPauser("uADBondingShare", "uBOND") {}
}
