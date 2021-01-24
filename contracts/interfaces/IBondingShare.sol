// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBondingShare is IERC20 {
    function mint(address to, uint256 amount) external;

    function pause() external;

    function unpause() external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;
}
