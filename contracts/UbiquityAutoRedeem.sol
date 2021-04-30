// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.3;

import "./ERC20Ubiquity.sol";

contract UbiquityAutoRedeem is ERC20Ubiquity {
    constructor(address _manager)
        ERC20Ubiquity(_manager, "UbiquityAutoRedeem", "uAR")
    {} // solhint-disable-line no-empty-blocks
}
