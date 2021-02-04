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

    /// @dev Block height recorded at the beginning of a debt cycle
    uint256 public beginningOfDebtCycle = 0;

    /// @dev Constant that determines the rate of decrease of uAR mint
    uint256 public uARMintControl = 1;

    /// @dev The two redemption pools of the contract.
    uint256 public couponRedemptionPool;
    uint256 public autoRedeemPool;

    /// @dev Set the value of the uAR mint control variable
    /// @param controlValue New uAR mint cotrol value.
    function setuARMintControl(uint256 controlValue) external {
        // require -- only DAO can call it.
        uARMintControl = controlValue;
    }

    /// @dev Lets debt holder burn uAD for uAR.
    /// @param amount the amount of uAD to redeem burn.
    /// @return amount of auto redeem pool tokens (i.e. LP tokens) minted to the caller
    function burnDollarsForAutoRedeemTokens(uint256 amount)
        public
        returns (uint256)
    {
        // Check whether TWAP < 1.
        uint256 twapPrice = _getTwapPrice();
        require(twapPrice < 1 ether, "Price must be above 1 to redeem coupons");

        // Check caller's uAD balance.
        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        require(
            stabilitas.balanceOf(msg.sender) > amount,
            "There aren't enough uAD in caller's balance."
        );

        MockAutoRedeemToken uAR =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());

        // If it's the first call of the debt cycle, set the block
        // height as the beginning of the debt cycle.
        if (beginningOfDebtCycle == 0) beginningOfDebtCycle = block.number;

        // Calculate uAR to mint according to the formula: amt * (BH_debt / BH_burn)**control.
        uint256 uARToMint =
            amount.mul(
                (beginningOfDebtCycle.div(block.number))**uARMintControl
            );

        // Burn uAD.
        stabilitas.burn(msg.sender, amount);

        // Mint, then transfer uAR to sender.
        uAR.mint(address(this), uARToMint);
        uAR.transfer(msg.sender, uARToMint);

        return uAR.balanceOf(msg.sender);
    }

    /// @dev Exchange uAR for uAD.
    /// @param amount Amount of uAR to burn in exchange for uAD.
    /// @return caller's remaining balance of uAR.
    function burnAutoRedeemTokensForDollars(uint256 amount)
        public
        returns (uint256)
    {
        // Check whether TWAP > 1
        uint256 twapPrice = _getTwapPrice();
        require(twapPrice > 1 ether, "Price must be above 1 to redeem uAR");

        // Check caller's uAR balance
        MockAutoRedeemToken uAR =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());
        require(
            uAR.balanceOf(msg.sender) >= amount,
            "User doesn't have enough auto redeem pool tokens."
        );

        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        require(
            stabilitas.balanceOf(address(this)) > 0,
            "There aren't any stabilitas to redeem currently"
        );

        if (beginningOfDebtCycle != 0) beginningOfDebtCycle = 0;

        // Set amount of uAR to burn.
        uint256 amountToRedeem = amount;

        if (amount >= autoRedeemPool) {
            amountToRedeem = autoRedeemPool;
        }

        // Burn uAR -- transfer uAD.
        uAR.burn(msg.sender, amountToRedeem);
        stabilitas.transfer(msg.sender, amountToRedeem);

        return (uAR.balanceOf(msg.sender));
    }

    /// @dev Mint tokens to auto redeem pool.
    function mintToPools() public {
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

        if (beginningOfDebtCycle != 0) beginningOfDebtCycle = 0;

        mintClaimableDollars();

        uint256 maxRedeemableCoupons = couponRedemptionPool;
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

        MockStabilitasToken stabilitas =
            MockStabilitasToken(manager.uADTokenAddress());
        MockAutoRedeemToken uAR =
            MockAutoRedeemToken(manager.autoRedeemPoolTokenAddress());

        //TODO: @Steve to call mint on stabilitas contract here. dollars should
        // be minted to address(this)
        stabilitas.mint(address(this), dollarsToMint);

        uint256 autoRedeemPoolDeficit = uAR.totalSupply() - autoRedeemPool;
        uint256 couponRedemptionPoolDeficit =
            debtCoupon.getTotalOutstandingDebt() - couponRedemptionPool;

        if (dollarsToMint >= autoRedeemPoolDeficit) {
            autoRedeemPool += autoRedeemPoolDeficit;
            dollarsToMint -= autoRedeemPoolDeficit;
        } else {
            autoRedeemPool += dollarsToMint;
            dollarsToMint = 0;
        }

        if (dollarsToMint >= couponRedemptionPool) {
            autoRedeemPool += couponRedemptionPoolDeficit;
            dollarsToMint -= couponRedemptionPoolDeficit;
        } else {
            couponRedemptionPool += dollarsToMint;
            dollarsToMint = 0;
        }

        uint256 excessDollars = dollarsToMint;

        if (excessDollars > 0) {
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

        uint256 expiryBlockNumber = block.number.add(couponLengthSeconds);
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
}
