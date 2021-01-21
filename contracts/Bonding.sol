// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/ISablier.sol";

contract Bonding is Ownable {
    using SafeMath for uint256;

    ISablier public sablier;

    constructor(address _sablier) {
        sablier = ISablier(_sablier);
    }

    /// Setters
    function setSablier(address _sablier) public onlyOwner {
        sablier = ISablier(_sablier);
    }
}
