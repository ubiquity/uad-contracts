// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC1155Ubiquity.sol";

import "./UbiquityFormulas.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/ISablier.sol";
import "./interfaces/ITWAPOracle.sol";
import "./interfaces/IBondingShare.sol";
import "./utils/CollectableDust.sol";

import "hardhat/console.sol";

contract Bonding is CollectableDust {
    using SafeERC20 for IERC20;

    uint16 public id = 42;
    bytes public data = "";

    UbiquityAlgorithmicDollarManager public manager;

    uint256 public constant TARGET_PRICE = uint256(1 ether); // 3Crv has 18 decimals
    // Initially set at $1,000,000 to avoid interference with growth.
    uint256 public maxBondingPrice = uint256(1000000 ether);
    ISablier public sablier;
    uint256 public bondingDiscountMultiplier = uint256(1000000 gwei); // 0.001
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

    /*
        Desposit function with uAD-3CRV LP tokens (stableSwapMetaPoolAddress)
     */
    function bondTokens(
        uint256 _lpsAmount,
        uint256 _weeks,
        uint256 _block
    ) public {
        _updateOracle();
        uint256 currentPrice = currentTokenPrice();
        require(
            currentPrice < maxBondingPrice,
            "Bonding: Current price is too high"
        );
        IERC20(manager.stableSwapMetaPoolAddress()).safeTransferFrom(
            msg.sender,
            address(this),
            _lpsAmount
        );

        uint256 _sharesAmount =
            UbiquityFormulas.durationMultiply(
                _lpsAmount,
                _weeks,
                bondingDiscountMultiplier
            );
        _bond(_sharesAmount, _block);
    }

    function redeemShares(uint256 _sharesAmount) public {
        require(
            IERC1155Ubiquity(manager.bondingShareAddress()).balanceOf(
                msg.sender,
                id
            ) >= _sharesAmount,
            "Bonding: Caller does not have enough shares"
        );
        _updateOracle();
        uint256 _currentShareValue = currentShareValue();
        IBondingShare(manager.bondingShareAddress()).burn(
            msg.sender,
            id,
            _sharesAmount
        );

        // uint256 tokenAmount = formulaRedeemBonds(_sharesAmount, _currentShareValue);

        // console.log("_sharesAmount", _sharesAmount);
        // console.log("tokenAmount", tokenAmount);
        // if (redeemStreamTime == 0) {
        IERC20(manager.stableSwapMetaPoolAddress()).safeTransfer(
            msg.sender,
            UbiquityFormulas.redeemBonds(
                _sharesAmount,
                _currentShareValue,
                TARGET_PRICE
            )
        );
        //     } else {
        //         // The transaction must be processed by the Ethereum blockchain before
        //         // the start time of the stream, or otherwise the sablier contract
        //         // reverts with a "start time before block.timestamp" message.
        //         uint256 streamStart = block.timestamp + 60; // tx mining + 60 seconds
        //         uint256 streamStop = streamStart + redeemStreamTime;
        //         // The deposit must be a multiple of the difference between the stop
        //         // time and the start time

        //         uint256 streamDuration = streamStop - streamStart;
        //         tokenAmount = (tokenAmount / streamDuration) * streamDuration;

        //         IERC20(manager.stableSwapMetaPoolAddress()).safeApprove(
        //             address(sablier),
        //             0
        //         );
        //         IERC20(manager.stableSwapMetaPoolAddress()).safeApprove(
        //             address(sablier),
        //             tokenAmount
        //         );
        //         sablier.createStream(
        //             msg.sender,
        //             tokenAmount,
        //             manager.stableSwapMetaPoolAddress(),
        //             streamStart,
        //             streamStop
        //         );
        //     }
    }

    function redeemAllShares() public {
        redeemShares(
            IERC20(manager.bondingShareAddress()).balanceOf(msg.sender)
        );
    }

    // SI totalShares = 0  priceShare = TARGET_PRICE
    // SINON               priceShare = totalLP / totalShares * TARGET_PRICE
    // R = T == 0 ? 1 : LP / S
    // P = R * T
    function currentShareValue() public view returns (uint256 priceShare) {
        uint256 totalLP =
            IERC20(manager.stableSwapMetaPoolAddress()).balanceOf(
                address(this)
            );

        uint256 totalShares =
            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply(id);

        priceShare = UbiquityFormulas.bondPrice(
            totalLP,
            totalShares,
            TARGET_PRICE
        );
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

    function _bond(uint256 _amount, uint256 _block) internal {
        uint256 _currentShareValue = currentShareValue();
        require(
            _currentShareValue != 0,
            "Current Share Value should not be nul"
        );

        IBondingShare(manager.bondingShareAddress()).mint(
            msg.sender,
            _block,
            UbiquityFormulas.bonding(_amount, _currentShareValue, TARGET_PRICE),
            data
        );
    }

    function _updateOracle() internal {
        ITWAPOracle(manager.twapOracleAddress()).update();
    }
}
