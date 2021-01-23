// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StabilitasConfig.sol";
import "./interfaces/ISablier.sol";
import "./interfaces/IUniswapOracle.sol";
import "./utils/CollectableDust.sol";

contract Bonding is CollectableDust {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    StabilitasConfig public config;

    uint256 public constant TARGET_PRICE = 1000000; // USDC has 6 decimals
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = 1000000000000000000000000;
    ISablier public sablier;
    uint256 public bondingDiscountMultiplier = 0;
    uint256 public rewardsBalance;
    uint256 public redeemStreamTime = 604800; // 1 week in seconds

    modifier onlyBondingManager() {
        require(
            config.hasRole(config.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _;
    }

    event MaxBondingPriceUpdated(uint256 _maxBondingPrice);
    event SablierUpdated(address _sablier);
    event BondingDiscountMultiplierUpdated(uint256 _bondingDiscountMultiplier);
    event RedeemStreamTimeUpdated(uint256 _redeemStreamTime);

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

    function setMaxBondingPrice(uint256 _maxBondingPrice)
        external
        onlyBondingManager
    {
        maxBondingPrice = _maxBondingPrice;
        emit MaxBondingPriceUpdated(_maxBondingPrice);
    }

    function setSablier(address _sablier) external onlyBondingManager {
        sablier = ISablier(_sablier);
        emit SablierUpdated(_sablier);
    }

    function setBondingDiscountMultiplier(uint256 _bondingDiscountMultiplier)
        external
        onlyBondingManager
    {
        bondingDiscountMultiplier = _bondingDiscountMultiplier;
        emit BondingDiscountMultiplierUpdated(_bondingDiscountMultiplier);
    }

    function setRedeemStreamTime(uint256 _redeemStreamTime)
        external
        onlyBondingManager
    {
        redeemStreamTime = _redeemStreamTime;
        emit RedeemStreamTimeUpdated(_redeemStreamTime);
    }

    function bondTokens(uint256 _amount) public {
        IUniswapOracle(config.twapOracleAddress()).update(
            config.stabilitasTokenAddress(),
            config.comparisonTokenAddress()
        );
        uint256 currentPrice =
            IUniswapOracle(config.twapOracleAddress()).consult(
                config.stabilitasTokenAddress(),
                TARGET_PRICE,
                config.comparisonTokenAddress()
            );
        require(
            currentPrice < maxBondingPrice,
            "Bonding: Current price is too high"
        );
        IERC20(config.stabilitasTokenAddress()).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
    }
}
