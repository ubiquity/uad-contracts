// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./utils/CollectableDust.sol";
import "./interfaces/ISablier.sol";

contract Bonding is Ownable, CollectableDust {
    using SafeMath for uint256;

    ISablier public sablier;

    constructor(address _sablier) CollectableDust() {
        sablier = ISablier(_sablier);
    }

    /// Setters
    function setSablier(address _sablier) public onlyOwner {
        sablier = ISablier(_sablier);
    }

    /// Collectable Dust
    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external override onlyOwner {
        _sendDust(_to, _token, _amount);
    }
}
