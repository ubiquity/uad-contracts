import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { Big } from "big.js";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingShare } from "../artifacts/types/BondingShare";
import { ERC20 } from "../artifacts/types/ERC20";
import { MockuADToken } from "../artifacts/types/MockuADToken";
import { MockDebtCoupon } from "../artifacts/types/MockDebtCoupon";
import { DebtCouponManager } from "../artifacts/types/DebtCouponManager";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { mineBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { CouponsForDollarsCalculator } from "../artifacts/types/CouponsForDollarsCalculator";

describe("DebtCouponManager", () => {
  let metaPool: IMetaPool;
  let couponsForDollarsCalculator: CouponsForDollarsCalculator;
  let manager: UbiquityAlgorithmicDollarManager;
  let debtCouponMgr: DebtCouponManager;
  let twapOracle: TWAPOracle;
  let debtCoupon: MockDebtCoupon;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: MockuADToken;
  let sablier: string;
  let USDC: string;
  let DAI: string;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  // let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;
  const couponLengthBlocks = 10;
  Big.DP = 35;

  const setup = async (uADTotalSupply: BigNumber, totalDebt: BigNumber) => {
    // set uAD Mock
    const UAD = await ethers.getContractFactory("MockuADToken");
    uAD = (await UAD.deploy(uADTotalSupply)) as MockuADToken;
    await manager.connect(admin).setuADTokenAddress(uAD.address);
    // set debt coupon Mock
    const debtCouponFactory = await ethers.getContractFactory("MockDebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(totalDebt)) as MockDebtCoupon;
    await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);
  };
  const calcPremium = (uADTotalSupply: Big, totalDebt: Big): Big => {
    /*  const r = Number.parseFloat((totalDebt / uADTotalSupply).toPrecision(40));
    const rMinus = Number.parseFloat((1 - r).toPrecision(40));
    const rMinusSquared = Number.parseFloat((rMinus ** 2).toPrecision(40));
    const prem = Number.parseFloat((1 / rMinusSquared).toPrecision(40)); */

    const one = new Big(1);
    const prem = one.div(one.sub(totalDebt.div(uADTotalSupply)).pow(2));

    console.log(
      `----- prem :${prem.toFixed(35)}

     `
    );

    return prem;
    /*  const r = totalDebt.div(uADTotalSupply);
    console.log(
      `-----uADTotalSupply:${uADTotalSupply} totalDebt:${totalDebt}
      --r:${r.toString()} ${r.toNumber()}

     `
    );
    const denominatorSqr = BigNumber.from(1).sub(r);
    console.log(
      `denominatorSqr:${denominatorSqr.toString()}

     `
    );
    const denominator = denominatorSqr.pow(2);
    console.log(
      `denominator:${denominator.toString()}

     `
    );
    const invDenominator = BigNumber.from(1).div(denominator);
    return invDenominator.sub(BigNumber.from(1)); */
    // premium is ( 1 / (1-R)² ) -1 with r = totalDebt/uADTotalSupply
  };
  beforeEach(async () => {
    // list of accounts
    ({
      sablier,
      USDC,
      DAI,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();
    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    // set coupon for dollars calculator
    const couponsForDollarsCalculatorFactory = await ethers.getContractFactory(
      "CouponsForDollarsCalculator"
    );
    couponsForDollarsCalculator = (await couponsForDollarsCalculatorFactory.deploy(
      manager.address
    )) as CouponsForDollarsCalculator;

    await manager
      .connect(admin)
      .setCouponCalculatorAddress(couponsForDollarsCalculator.address);

    // set debt coupon Manager
    const dcManagerFactory = await ethers.getContractFactory(
      "DebtCouponManager"
    );

    debtCouponMgr = (await dcManagerFactory.deploy(
      manager.address,
      couponLengthBlocks
    )) as DebtCouponManager;
    // debtCouponMgr should have the COUPON_MANAGER_ROLE
    const COUPON_MANAGER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("COUPON_MANAGER")
    );
    await manager
      .connect(admin)
      .grantRole(COUPON_MANAGER_ROLE, debtCouponMgr.address);
  });
  describe("CouponsForDollarsCalculator", () => {
    it("getCouponAmount should work without debt set to 0", async () => {
      await setup(BigNumber.from(10000000), BigNumber.from(0));
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = 1;

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      expect(couponToMint).to.equal(amountToExchangeForCoupon);
    });
    it("getCouponAmount should work without debt set to 0 and large supply", async () => {
      await setup(ethers.utils.parseEther("100000000"), BigNumber.from(0));
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);

      const amountToExchangeForCoupon = ethers.utils.parseEther("1");

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      expect(couponToMint).to.equal(amountToExchangeForCoupon);
    });
    it("getCouponAmount should work without debt set to 10%", async () => {
      const totalSupply = ethers.utils.parseEther("100000000");
      const totalDebt = ethers.utils.parseEther("10000000");
      const premium = calcPremium(new Big("100000000"), new Big("10000000"));
      const amount = new Big(42.456);
      // with 25 decimals
      // premium  1.2345679012345679012345679
      // couponToMint 52.4148148148148148148148148
      await setup(totalSupply, totalDebt);
      // check that total debt is null
      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(totalDebt);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt));
      const amountToExchangeForCoupon = ethers.utils.parseEther(
        amount.toString()
      );

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      console.log("couponToMint", ethers.utils.formatEther(couponToMint));
      const amountWithPremium = amount.mul(premium).toPrecision(21);
      const amountWithPremiumLessPrecise = amountWithPremium.substr(
        0,
        amountWithPremium.indexOf(".") + 19
      );
      console.log("amountWithPremium", amountWithPremiumLessPrecise);

      expect(couponToMint).to.equal(
        ethers.utils.parseEther(amountWithPremiumLessPrecise)
      );
    });
    it("getCouponAmount should work without debt set to 50%", async () => {
      const totalDebt = "1082743732732734394894";
      const totalSupply = "2165487465465468789789";
      const amountStr = "6546546778667854444";
      const premium = calcPremium(new Big(totalSupply), new Big(totalDebt));
      const amount = new Big(amountStr);
      // with 20 decimals
      // premium  4
      // couponToMint 26186187114671417775,97581497234938487164

      await setup(BigNumber.from(totalSupply), BigNumber.from(totalDebt));
      // check that total debt is null
      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(totalDebt);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = BigNumber.from(amountStr);

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      console.log("couponToMint", ethers.utils.formatEther(couponToMint));
      const amountWithPremium = amount.mul(premium).toPrecision(22);
      const amountWithPremiumLessPrecise = amountWithPremium.substr(
        0,
        amountWithPremium.indexOf(".")
      );
      console.log("amountWithPremium", amountWithPremium);
      console.log("amountWithPremiumLessPrecise", amountWithPremiumLessPrecise);

      expect(couponToMint).to.equal(amountWithPremiumLessPrecise);
    });
    it("getCouponAmount should work without debt set to 99%", async () => {
      const totalDebt = "2165487465465468789789";
      const totalSupply = "2185487465465468799999";
      const amountStr = "65465456489789711112";
      const premium = calcPremium(new Big(totalSupply), new Big(totalDebt));
      const amount = new Big(amountStr);
      // with 20 decimals
      // premium  11940,88865426668451012637
      // couponToMint 781715726645319251457397,253671655233117279062
      await setup(BigNumber.from(totalSupply), BigNumber.from(totalDebt));

      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(totalDebt);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = BigNumber.from(amountStr);

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      console.log("couponToMint", ethers.utils.formatEther(couponToMint));
      const amountWithPremium = amount.mul(premium).toFixed(25);
      const amountWithPremiumLessPrecise = amountWithPremium.substr(
        0,
        amountWithPremium.indexOf(".")
      );
      console.log("amountWithPremium", amountWithPremium);
      console.log("amountWithPremiumLessPrecise", amountWithPremiumLessPrecise);

      expect(couponToMint).to.equal(amountWithPremiumLessPrecise);
    });
    it("getCouponAmount should revert with debt set to 100%", async () => {
      const totalDebt = "2165487465465468789789";

      await setup(BigNumber.from(totalDebt), BigNumber.from(totalDebt));

      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(totalDebt);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));

      await expect(
        couponsForDollarsCalculator.getCouponAmount(1)
      ).to.revertedWith("coupon4Dollar: DEBT_TOO_HIGH");
    });
  });
});
