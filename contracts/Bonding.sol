// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StabilitasConfig.sol";
import "./interfaces/ISablier.sol";
import "./utils/CollectableDust.sol";

contract Bonding is CollectableDust {
    using SafeMath for uint256;

    StabilitasConfig public config;

    uint256 public constant TARGET_PRICE = 1000000; // USDC has 6 decimals
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = 1000000000000000000000000;
    uint256 public bondingDiscountMultiplier = 0;
    ISablier public sablier;
    uint256 public rewardsBalance;
    uint256 public redeemStreamTime = 604800; // 1 week in seconds

    modifier onlyBondingManager() {
        require(
            config.hasRole(config.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _;
    }

    constructor(address _config, address _sablier) CollectableDust() {
        config = StabilitasConfig(_config);
        sablier = ISablier(_sablier);
    }

    /// Collectable Dust
    function addProtocolToken(address _token)
        external
        override
        onlyBondingManager
    {
        _addProtocolToken(_token);
    }

    function removeProtocolToken(address _token)
        external
        override
        onlyBondingManager
    {
        _removeProtocolToken(_token);
    }

    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external override onlyBondingManager {
        _sendDust(_to, _token, _amount);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function setSablier(address _sablier) external onlyBondingManager {
        sablier = ISablier(_sablier);
    }

    function setBondingDiscountMultiplier(uint256 _bondingDiscountMultiplier)
        external
        onlyBondingManager
    {
        bondingDiscountMultiplier = _bondingDiscountMultiplier;
    }
}
