// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IDebtRedemption.sol";
import "./interfaces/ICouponsForDollarsCalculator.sol";
import "./interfaces/IDollarMintingCalculator.sol";
import "./interfaces/IExcessDollarsDistributor.sol";
import "./TWAPOracle.sol";
import "./mocks/MockStabilitasToken.sol";
import "./mocks/MockAutoRedeemToken.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./DebtCoupon.sol";

/// @title A basic debt issuing and redemption mechanism for coupon holders
/// @notice Allows users to burn their stabilitas in exchange for coupons
/// redeemable in the future
/// @notice Allows users to redeem individual debt coupons or batch redeem
/// coupons on a first-come first-serve basis
contract DebtCouponManager is ERC165, IERC1155Receiver {
    using SafeMath for uint256;

    UbiquityAlgorithmicDollarManager public manager;

    //the amount of dollars we minted this cycle, so we can calculate delta.
    // should be reset to 0 when cycle ends
    uint256 public dollarsMintedThisCycle;
    uint256 public couponLengthSeconds;

    /// @param _manager the address of the manager contract so we can fetch variables
    /// @param _couponLengthSeconds how long coupons last in seconds. can't be changed
    /// once set (unless migrated)
    constructor(address _manager, uint256 _couponLengthSeconds) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        couponLengthSeconds = _couponLengthSeconds;
    }

    function _getTwapPrice() internal view returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        return oracle.consult(manager.uADTokenAddress(), 1 ether);
    }

    /// @dev Lets debt holder burn coupons for auto redemption. Doesn't make TWAP > 1 check.
    /// @param id the timestamp of the coupon
    /// @param amount the amount of coupons to redeem
    /// @return amount of auto redeem pool tokens (i.e. LP tokens) minted to debt holder
    function burnCouponsForAutoRedemption(uint256 id, uint256 amount)
        public
        returns (uint256)
    {
        // Check whether debt coupon hasn't expired --> Burn debt coupons.
        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());

        require(id > block.timestamp, "Coupon has expired");
        require(
            debtCoupon.balanceOf(msg.sender, id) >= amount,
            "User doesnt have enough coupons"
        );

        debtCoupon.safeTransferFrom(msg.sender, address(this), id, amount, "");

        debtCoupon.burnCoupons(address(this), amount, id);

        // Mint LP tokens to this contract. Transfer LP tokens to msg.sender i.e. debt holder
        MockAutoRedeemToken autoRedeemToken =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());
        autoRedeemToken.mint(address(this), amount);
        autoRedeemToken.transfer(msg.sender, amount);

        return autoRedeemToken.balanceOf(msg.sender);
    }

    /// @dev Exchange auto redeem pool tokens (i.e. LP tokens) for uAD tokens.
    /// @param amount Amount of LP tokens to burn in exchange for uAD tokens.
    /// @return msg.sender's remaining balance of LP tokens.
    function burnAutoRedeemTokensForDollars(uint256 amount)
        public
        returns (uint256)
    {
        MockAutoRedeemToken autoRedeemToken =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());
        require(
            autoRedeemToken.balanceOf(msg.sender) >= amount,
            "User doesn't have enough auto redeem pool tokens."
        );

        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        require(
            stabilitas.balanceOf(address(this)) > 0,
            "There aren't any stabilitas to redeem currently"
        );

        // Elementary LP shares calculation. Can be updated for more complex / tailored math.
        uint256 totalBalanceOfPool = stabilitas.balanceOf(address(this));
        uint256 amountToRedeem =
            totalBalanceOfPool.mul(amount.div(autoRedeemToken.totalSupply()));

        autoRedeemToken.burn(msg.sender, amount);
        stabilitas.transfer(msg.sender, amountToRedeem);

        return (autoRedeemToken.balanceOf(msg.sender));
    }

    /// @dev Mint tokens to auto redeem pool.
    function autoRedeemCoupons() public {
        // Check whether TWAP > 1.
        uint256 twapPrice = _getTwapPrice();
        require(twapPrice > 1 ether, "Price must be above 1 to redeem coupons");

        mintClaimableDollars();

        // TODO: reward msg.sender for calling this function. Determine reward logic.
    }

    /// @param id the timestamp of the coupon
    /// @param amount the amount of coupons to redeem
    /// @return amount of unredeemed coupons
    function redeemCoupons(uint256 id, uint256 amount)
        public
        returns (uint256)
    {
        uint256 twapPrice = _getTwapPrice();

        require(twapPrice > 1 ether, "Price must be above 1 to redeem coupons");

        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());

        require(id > block.timestamp, "Coupon has expired");
        require(
            debtCoupon.balanceOf(msg.sender, id) >= amount,
            "User doesnt have enough coupons"
        );

        mintClaimableDollars();

        uint256 maxRedeemableCoupons =
            MockStabilitasToken(manager.uADTokenAddress()).balanceOf(
                address(this)
            );
        uint256 couponsToRedeem = amount;

        if (amount > maxRedeemableCoupons) {
            couponsToRedeem = maxRedeemableCoupons;
        }

        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        require(
            stabilitas.balanceOf(address(this)) > 0,
            "There aren't any stabilitas to redeem currently"
        );

        // BUG(?): replace `amount` with couponsToRedeem
        debtCoupon.safeTransferFrom(
            msg.sender,
            address(this),
            id,
            couponsToRedeem,
            ""
        );

        debtCoupon.burnCoupons(address(this), couponsToRedeem, id);

        stabilitas.transfer(msg.sender, couponsToRedeem);

        return amount.sub(couponsToRedeem);
    }

    function mintClaimableDollars() public {
        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());
        debtCoupon.updateTotalDebt();

        // uint256 twapPrice = _getTwapPrice(); //unused variable. Why here?
        uint256 totalMintableDollars =
            IDollarMintingCalculator(manager.dollarCalculatorAddress())
                .getDollarsToMint();
        uint256 dollarsToMint =
            totalMintableDollars.sub(dollarsMintedThisCycle);

        //update the dollars for this cycle
        dollarsMintedThisCycle = totalMintableDollars;

        //TODO: @Steve to call mint on stabilitas contract here. dollars should
        // be minted to address(this)
        MockStabilitasToken(manager.uADTokenAddress()).mint(
            address(this),
            dollarsToMint
        );

        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        MockAutoRedeemToken autoRedeemToken =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());

        uint256 currentRedeemableBalance = stabilitas.balanceOf(address(this));
        uint256 totalOutstandingDebt =
            debtCoupon.getTotalOutstandingDebt() +
                autoRedeemToken.totalSupply();

        if (currentRedeemableBalance > totalOutstandingDebt) {
            uint256 excessDollars =
                currentRedeemableBalance.sub(totalOutstandingDebt);

            IExcessDollarsDistributor dollarsDistributor =
                IExcessDollarsDistributor(
                    manager.getExcessDollarsDistributor(address(this))
                );

            //transfer excess dollars to the distributor and tell it to distribute
            MockStabilitasToken(manager.uADTokenAddress()).transfer(
                manager.getExcessDollarsDistributor(address(this)),
                excessDollars
            );
            dollarsDistributor.distributeDollars();
        }
    }

    /// @dev called when a user wants to redeem. should only be called when oracle is below a dollar
    /// @param amount the amount of dollars to exchange for coupons
    function exchangeDollarsForCoupons(uint256 amount)
        external
        returns (uint256)
    {
        uint256 twapPrice = _getTwapPrice();

        require(twapPrice < 1 ether, "Price must be below 1 to mint coupons");

        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());
        debtCoupon.updateTotalDebt();

        //we are in a down cycle so reset the cycle counter
        dollarsMintedThisCycle = 0;

        ICouponsForDollarsCalculator couponCalculator =
            ICouponsForDollarsCalculator(manager.couponCalculatorAddress());
        uint256 couponsToMint = couponCalculator.getCouponAmount(amount);

        //TODO: @Steve to call burn on stabilitas contract here
        MockStabilitasToken(manager.uADTokenAddress()).burn(msg.sender, amount);

        uint256 expiryTimestamp = block.timestamp.add(couponLengthSeconds);
        debtCoupon.mintCoupons(msg.sender, couponsToMint, expiryTimestamp);

        //give the caller timestamp of minted nft
        return expiryTimestamp;
    }

    /// @dev uses the current coupons for dollars calculation to get coupons for dollars
    /// @param amount the amount of dollars to exchange for coupons
    function getCouponsReturnedForDollars(uint256 amount)
        external
        view
        returns (uint256)
    {
        ICouponsForDollarsCalculator couponCalculator =
            ICouponsForDollarsCalculator(manager.couponCalculatorAddress());
        return couponCalculator.getCouponAmount(amount);
    }

    /// @dev should be called by this contract only when getting coupons to be burnt
    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        if (manager.hasRole(manager.COUPON_MANAGER_ROLE(), operator)) {
            //allow the transfer since it originated from this contract
            return
                bytes4(
                    keccak256(
                        "onERC1155Received(address,address,uint256,uint256,bytes)"
                    )
                );
        } else {
            //reject the transfer
            return "";
        }
    }

    /// @dev this method is never called by the contract so if called,
    /// it was called by someone else -> revert.
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        //reject the transfer
        return "";
    }
}
