// contracts/GLDToken.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockDebtCoupon is ERC1155 {
    uint256 private _totalOutstandingDebt;

    //@dev URI param is if we want to add an off-chain meta data uri associated with this contract
    constructor(uint256 totalDebt) ERC1155("URI") {
        _totalOutstandingDebt = totalDebt;
    }

    function getTotalOutstandingDebt() public view returns (uint256) {
        return _totalOutstandingDebt;
    }
}
