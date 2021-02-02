// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title A debt coupon which corresponds to a IDebtRedemption contract
interface IDebtCoupon is IERC1155 {
    function redemptionContractAddress() external returns (address);
}
