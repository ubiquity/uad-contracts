import { BigNumber, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingShare } from "../artifacts/types/BondingShare";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
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
  let debtCoupon: DebtCoupon;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let sablier: string;
  let USDC: string;
  let DAI: string;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  // let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;

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
    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy()) as UbiquityAlgorithmicDollar;
    await manager.connect(admin).setuADTokenAddress(uAD.address);

    // set twap Oracle Address
    const crvToken = (await ethers.getContractAt(
      "ERC20",
      curve3CrvToken
    )) as ERC20;

    // to deploy the stableswap pool we need 3CRV and uAD
    // kindly ask a whale to give us some 3CRV
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    const curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));
    // just mint som uAD
    await uAD
      .connect(admin)
      .mint(manager.address, ethers.utils.parseEther("10000"));
    console.log(
      `CurveFactory:${curveFactory}
      curveWhale:${curveWhale}
         curve3CrvBasePool: ${curve3CrvBasePool}
         crvToken:${crvToken.address}`
    );
    await manager
      .connect(admin)
      .deployStableSwapPool(
        curveFactory,
        curve3CrvBasePool,
        crvToken.address,
        10,
        4000000
      );
    // setup the oracle
    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;
    console.log(
      `
         crvToken:${metaPoolAddr}`
    );
    const TWAPOracleFactory = await ethers.getContractFactory("TWAPOracle");
    twapOracle = (await TWAPOracleFactory.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;

    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);
    const couponsForDollarsCalculatorFactory = await ethers.getContractFactory(
      "CouponsForDollarsCalculator"
    );
    couponsForDollarsCalculator = (await couponsForDollarsCalculatorFactory.deploy(
      manager.address
    )) as CouponsForDollarsCalculator;

    await manager
      .connect(admin)
      .setCouponCalculatorAddress(couponsForDollarsCalculator.address);
    // set debt coupon token
    const dcManagerFactory = await ethers.getContractFactory(
      "DebtCouponManager"
    );
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      await admin.getAddress()
    )) as DebtCoupon;

    await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);
    debtCouponMgr = (await dcManagerFactory.deploy(
      manager.address,
      10
    )) as DebtCouponManager;
  });
  describe("DebtCouponManager", () => {
    it("exchangeDollarsForCoupons should fail if uAD price is >= 1", async () => {
      await expect(
        debtCouponMgr.connect(secondAccount).exchangeDollarsForCoupons(1)
      ).to.revertedWith("Price must be below 1 to mint coupons");
    });
    it("exchangeDollarsForCoupons should work", async () => {
      const pool0bal = await metaPool.balances(0);
      const pool1bal = await metaPool.balances(1);
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));
      console.log(
        `pool0bal:${pool0bal.toString()} pool1bal:${pool1bal.toString()} `
      );
      // Price must be below 1 to mint coupons
      await twapOracle.update();
      const uADPrice = await twapOracle.consult(uAD.address);
      console.log("uADPrice", ethers.utils.formatEther(uADPrice.toString()));
      // remove liquidity one coin 3CRV only so that uAD will be worth less
      const admBalance = await metaPool.balanceOf(await admin.getAddress());
      console.log(
        "admBalance of uAD-3CRV lp token",
        ethers.utils.formatEther(admBalance.toString())
      );
      // calculation to withdraw 1e18 LP token
      // Calculate the amount received when withdrawing and unwrapping in a single coin.
      // Useful for setting _max_burn_amount when calling remove_liquidity_one_coin.
      const lpTo3CRV = await metaPool["calc_withdraw_one_coin(uint256,int128)"](
        ethers.utils.parseEther("1"),
        1
      );

      console.log("lpTo3CRV", ethers.utils.formatEther(lpTo3CRV.toString()));
      const x = BigNumber.from("1").mul(101).div(100);
      console.log(
        "----x ",
        lpTo3CRV.toString(),
        lpTo3CRV.div(100).mul(101).toString(),
        x.toString(),
        x.toNumber(),
        x.toHexString(),
        ethers.utils.formatEther(x)
      );
      const expected = lpTo3CRV.div(100).mul(99);
      // approve meto to burn LP on behalf of admin
      await metaPool.approve(metaPool.address, admBalance);
      console.log("---- d");
      //  StableSwap.remove_liquidity_one_coin
      //        (_burn_amount: uint256, i: int128,
      //         _min_received: uint256, _receiver: address = msg.sender) → uint256: nonpayable
      // Withdraw a single asset from the pool.
      await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
        ethers.utils.parseEther("1"),
        1,
        expected
      );
      const pool0balAfter = await metaPool.balances(0);
      const pool1balAfter = await metaPool.balances(1);
      /*
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000")); */
      console.log(
        `pool0balAfter:${pool0balAfter.toString()} pool1balAfter:${pool1balAfter.toString()} `
      );
      await twapOracle.update();
      const uADPriceAfter = await twapOracle.consult(uAD.address);
      console.log(
        "uADPriceAfter",
        ethers.utils.formatEther(uADPriceAfter.toString())
      );
      const amount = await debtCouponMgr
        .connect(secondAccount)
        .exchangeDollarsForCoupons(1);
    });
  });
});
