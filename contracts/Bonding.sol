// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/ISablier.sol";
import "./interfaces/ITWAPOracle.sol";
import "./interfaces/IBondingShare.sol";
import "./utils/CollectableDust.sol";

contract Bonding is CollectableDust {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    UbiquityAlgorithmicDollarManager public manager;

    uint256 public constant TARGET_PRICE = 1 ether; // 3Crv has 18 decimals
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = uint256(1 ether).mul(1000000);
    ISablier public sablier;
    uint256 public bondingDiscountMultiplier = 0;
    uint256 public redeemStreamTime = 86400; // 1 day in seconds

    event MaxBondingPriceUpdated(uint256 _maxBondingPrice);
    event SablierUpdated(address _sablier);
    event BondingDiscountMultiplierUpdated(uint256 _bondingDiscountMultiplier);
    event RedeemStreamTimeUpdated(uint256 _redeemStreamTime);

    modifier onlyBondingManager() {
        require(
            manager.hasRole(manager.BONDING_MANAGER_ROLE(), msg.sender),
            "Caller is not a bonding manager"
        );
        _;
    }

    constructor(address _manager, address _sablier) CollectableDust() {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        sablier = ISablier(_sablier);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

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
        _updateOracle();
        uint256 currentPrice = currentTokenPrice();
        require(
            currentPrice < maxBondingPrice,
            "Bonding: Current price is too high"
        );
        IERC20(manager.uADTokenAddress()).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        _bond(_amount, currentPrice);
    }

    function redeemShares(uint256 _sharesAmount) public {
        _updateOracle();

        require(
            IERC20(manager.bondingShareAddress()).balanceOf(msg.sender) >=
                _sharesAmount,
            "Bonding: Caller does not have enough shares"
        );

        IBondingShare(manager.bondingShareAddress()).burnFrom(
            msg.sender,
            _sharesAmount
        );

        uint256 tokenAmount =
            _sharesAmount.mul(currentShareValue()).div(TARGET_PRICE);

        if (redeemStreamTime == 0) {
            IERC20(manager.uADTokenAddress()).safeTransfer(
                msg.sender,
                tokenAmount
            );
        } else {
            // The transaction must be processed by the Ethereum blockchain before
            // the start time of the stream, or otherwise the sablier contract
            // reverts with a "start time before block.timestamp" message.
            uint256 streamStart = block.timestamp.add(60); // tx mining + 60 seconds

            uint256 streamStop = streamStart.add(redeemStreamTime);
            // The deposit must be a multiple of the difference between the stop
            // time and the start time
            uint256 streamDuration = streamStop.sub(streamStart);
            tokenAmount = tokenAmount.div(streamDuration).mul(streamDuration);

            IERC20(manager.uADTokenAddress()).safeApprove(address(sablier), 0);
            IERC20(manager.uADTokenAddress()).safeApprove(
                address(sablier),
                tokenAmount
            );

            sablier.createStream(
                msg.sender,
                tokenAmount,
                manager.uADTokenAddress(),
                streamStart,
                streamStop
            );
        }
    }

    function redeemAllShares() public {
        redeemShares(
            IERC20(manager.bondingShareAddress()).balanceOf(msg.sender)
        );
    }

    function currentShareValue() public view returns (uint256 pricePerShare) {
        uint256 totalShares =
            IERC20(manager.bondingShareAddress()).totalSupply();

        pricePerShare = totalShares == 0
            ? TARGET_PRICE
            : IERC20(manager.uADTokenAddress())
                .balanceOf(address(this))
                .mul(TARGET_PRICE)
                .div(totalShares);
    }

    function currentTokenPrice() public view returns (uint256) {
        /* uint256[2] memory prices =
            IMetaPool(manager.stableSwapMetaPoolAddress())
                .get_price_cumulative_last();
        return prices[0]; */
        return
            ITWAPOracle(manager.twapOracleAddress()).consult(
                manager.uADTokenAddress()
            );
    }

    function _bond(uint256 _amount, uint256 currentPrice) internal {
        uint256 shareValue = currentShareValue();
        uint256 numberOfShares = _amount.div(shareValue).mul(TARGET_PRICE);

        if (bondingDiscountMultiplier != 0) {
            uint256 bonus =
                (TARGET_PRICE.sub(currentPrice))
                    .mul(numberOfShares)
                    .mul(bondingDiscountMultiplier)
                    .div(TARGET_PRICE.mul(TARGET_PRICE));
            numberOfShares = numberOfShares.add(bonus);
        }

        IBondingShare(manager.bondingShareAddress()).mint(
            msg.sender,
            numberOfShares
        );
    }

    function _updateOracle() internal {
        ITWAPOracle(manager.twapOracleAddress()).update();
    }
}
