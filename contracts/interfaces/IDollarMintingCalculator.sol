// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

/// @title A mechanism for calculating dollars to be minted
interface IDollarMintingCalculator {
    function getDollarsToMint() external view returns (uint256);
}
