// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBondingShare is IERC20 {
    function mint(address to, uint256 amount) external;

    function pause() external;

    function unpause() external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;
}
