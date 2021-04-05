import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
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
  const calcPremium = (uADTotalSupply: number, totalDebt: number): number => {
    const prem = 1 / (1 - totalDebt / uADTotalSupply) ** 2 - 1;
    const prem2 = 1 - (1 - totalDebt / uADTotalSupply) ** 2;
    console.log(
      `-----prem:${prem} prem2:${prem2}


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
    //premium is ( 1 / (1-R)² ) -1 with r = totalDebt/uADTotalSupply
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
    it.only("getCouponAmount should work without debt set to 10%", async () => {
      const premium = calcPremium(100, 10);
      const amount = 42.456;
      const totalSupply = ethers.utils.parseEther("100000000");
      const totalDebt = ethers.utils.parseEther("10000000");
      await setup(totalSupply, totalDebt);
      // check that total debt is null
      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(totalDebt);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = ethers.utils.parseEther(
        amount.toString()
      );

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      const amountWithPremium = amount + amount * premium;
      expect(couponToMint).to.equal(
        ethers.utils.parseEther(amountWithPremium.toString())
      );
    });
    it("getCouponAmount should work without debt set to 50%", async () => {
      let couponToMintCal = calcPremium(100, 0);
      console.log(
        `couponToMintCal supply:100 debt0:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 10);
      console.log(
        `couponToMintCal supply:100 debt10:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 50);
      console.log(
        `couponToMintCal supply:100 debt50:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 99);
      console.log(
        `couponToMintCal supply:100 debt99.99999:${couponToMintCal.toString()}
       `
      );
      await setup(BigNumber.from(10), BigNumber.from(0));
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = 1;

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );

      expect(couponToMint).to.equal(1);
    });
    it("getCouponAmount should work without debt set to 100%", async () => {
      let couponToMintCal = calcPremium(100, 0);
      console.log(
        `couponToMintCal supply:100 debt0:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 10);
      console.log(
        `couponToMintCal supply:100 debt10:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 50);
      console.log(
        `couponToMintCal supply:100 debt50:${couponToMintCal.toString()}
       `
      );
      couponToMintCal = calcPremium(100, 99);
      console.log(
        `couponToMintCal supply:100 debt99.99999:${couponToMintCal.toString()}
       `
      );
      await setup(BigNumber.from(10), BigNumber.from(0));
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);
      console.log("totalDebt", ethers.utils.formatEther(totalDebt.toString()));
      const amountToExchangeForCoupon = 1;

      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );

      expect(couponToMint).to.equal(1);
    });
  });
});
