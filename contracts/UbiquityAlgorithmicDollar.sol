// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract UbiquityAlgorithmicDollar is ERC20PresetMinterPauser {
    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20PresetMinterPauser("UbiquityAlgorithmicDollar", "uAD") {}
}
