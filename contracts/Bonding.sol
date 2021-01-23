// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "./utils/CollectableDust.sol";
import "./interfaces/ISablier.sol";
import "./StabilitasConfig.sol";

contract Bonding is CollectableDust {
    using SafeMath for uint256;

    StabilitasConfig public config;

    uint256 public constant TARGET_PRICE = 1000000; // USDC has 6 decimals
    ISablier public sablier;
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = 1000000000000000000000000;
    uint256 public bondingDiscountMultiplier = 0;
    uint256 public rewardsBalance;
    uint256 public redeemStreamTime = 604800; // 1 week in seconds

    constructor(address _config) CollectableDust() {
        config = StabilitasConfig(_config);
    }

    /// Collectable Dust
    function addProtocolToken(address _token) external override {
        require(
            config.hasRole(config.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _addProtocolToken(_token);
    }

    function removeProtocolToken(address _token) external override {
        require(
            config.hasRole(config.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _removeProtocolToken(_token);
    }

    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external override {
        require(
            config.hasRole(config.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _sendDust(_to, _token, _amount);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
