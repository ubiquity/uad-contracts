// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IDebtRedemption.sol";
import "./interfaces/ICouponsForDollarsCalculator.sol";
import "./interfaces/IDollarMintingCalculator.sol";
import "./interfaces/IExcessDollarsDistributor.sol";
import "./TWAPOracle.sol";
import "./UbiquityAlgorithmicDollar.sol";
import "./mocks/MockAutoRedeemToken.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./DebtCoupon.sol";

/// @title A basic debt issuing and redemption mechanism for coupon holders
/// @notice Allows users to burn their uAD in exchange for coupons
/// redeemable in the future
/// @notice Allows users to redeem individual debt coupons or batch redeem
/// coupons on a first-come first-serve basis
contract DebtCouponManager is ERC165, IERC1155Receiver {
    UbiquityAlgorithmicDollarManager public manager;

    //the amount of dollars we minted this cycle, so we can calculate delta.
    // should be reset to 0 when cycle ends
    uint256 public dollarsMintedThisCycle;
    uint256 public couponLengthBlocks;

    /// @param _manager the address of the manager contract so we can fetch variables
    /// @param _couponLengthBlocks how many blocks coupons last. can't be changed
    /// once set (unless migrated)
    constructor(address _manager, uint256 _couponLengthBlocks) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        couponLengthBlocks = _couponLengthBlocks;
        // TODO ADD address(this) as minter for uAD ????
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

        // we burn user's dollars.
        UbiquityAlgorithmicDollar(manager.uADTokenAddress()).burnFrom(
            msg.sender,
            amount
        );

        uint256 expiryBlockNumber = block.number + (couponLengthBlocks);
        debtCoupon.mintCoupons(msg.sender, couponsToMint, expiryBlockNumber);

        //give the caller the block number of the minted nft
        return expiryBlockNumber;
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

        UbiquityAlgorithmicDollar uAD =
            UbiquityAlgorithmicDollar(manager.uADTokenAddress());
        require(
            uAD.balanceOf(address(this)) > 0,
            "There aren't any uAD to redeem currently"
        );

        // Elementary LP shares calculation. Can be updated for more complex / tailored math.
        uint256 totalBalanceOfPool = uAD.balanceOf(address(this));
        uint256 amountToRedeem =
            totalBalanceOfPool * (amount / (autoRedeemToken.totalSupply()));

        autoRedeemToken.burn(msg.sender, amount);
        uAD.transfer(msg.sender, amountToRedeem);

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

    /// @param id the block number of the coupon
    /// @param amount the amount of coupons to redeem
    /// @return amount of unredeemed coupons
    function redeemCoupons(uint256 id, uint256 amount)
        public
        returns (uint256)
    {
        uint256 twapPrice = _getTwapPrice();

        require(twapPrice > 1 ether, "Price must be above 1 to redeem coupons");

        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());

        require(id > block.number, "Coupon has expired");
        require(
            debtCoupon.balanceOf(msg.sender, id) >= amount,
            "User doesnt have enough coupons"
        );

        mintClaimableDollars();
        UbiquityAlgorithmicDollar uAD =
            UbiquityAlgorithmicDollar(manager.uADTokenAddress());
        uint256 maxRedeemableCoupons = uAD.balanceOf(address(this));
        uint256 couponsToRedeem = amount;

        if (amount > maxRedeemableCoupons) {
            couponsToRedeem = maxRedeemableCoupons;
        }

        require(
            uAD.balanceOf(address(this)) > 0,
            "There aren't any uAD to redeem currently"
        );

        // debtCouponManager must be an operator to tranfer on behalf of msg.sender
        debtCoupon.burnCoupons(msg.sender, couponsToRedeem, id);

        uAD.transfer(msg.sender, couponsToRedeem);

        return amount - (couponsToRedeem);
    }

    function mintClaimableDollars() public {
        DebtCoupon debtCoupon = DebtCoupon(manager.debtCouponAddress());
        debtCoupon.updateTotalDebt();

        // uint256 twapPrice = _getTwapPrice(); //unused variable. Why here?
        uint256 totalMintableDollars =
            IDollarMintingCalculator(manager.dollarCalculatorAddress())
                .getDollarsToMint();
        uint256 dollarsToMint = totalMintableDollars - (dollarsMintedThisCycle);
        //update the dollars for this cycle
        dollarsMintedThisCycle = totalMintableDollars;

        UbiquityAlgorithmicDollar uAD =
            UbiquityAlgorithmicDollar(manager.uADTokenAddress());
        // uAD  dollars should  be minted to address(this)
        uAD.mint(address(this), dollarsToMint);
        MockAutoRedeemToken autoRedeemToken =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());

        uint256 currentRedeemableBalance = uAD.balanceOf(address(this));
        uint256 totalOutstandingDebt =
            debtCoupon.getTotalOutstandingDebt() +
                autoRedeemToken.totalSupply();

        if (currentRedeemableBalance > totalOutstandingDebt) {
            uint256 excessDollars =
                currentRedeemableBalance - (totalOutstandingDebt);

            IExcessDollarsDistributor dollarsDistributor =
                IExcessDollarsDistributor(
                    manager.getExcessDollarsDistributor(address(this))
                );
            //transfer excess dollars to the distributor and tell it to distribute
            uAD.transfer(
                manager.getExcessDollarsDistributor(address(this)),
                excessDollars
            );
            dollarsDistributor.distributeDollars();
        }
    }

    function _getTwapPrice() internal view returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        return oracle.consult(manager.uADTokenAddress());
    }
}
