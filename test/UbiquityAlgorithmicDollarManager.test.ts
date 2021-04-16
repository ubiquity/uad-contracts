import { BigNumber, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingShare } from "../artifacts/types/BondingShare";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";

describe("UbiquityAlgorithmicDollarManager", () => {
  // let bonding: Bonding;
  let debtCoupon: DebtCoupon;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  // let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;

  beforeEach(async () => {
    ({
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin] = await ethers.getSigners();
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;
    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      await admin.getAddress()
    )) as DebtCoupon;
  });
  describe("BondingShare", () => {
    it("Set should work", async () => {
      const BondingShareFactory = await ethers.getContractFactory(
        "BondingShare"
      );
      bondingShare = (await BondingShareFactory.deploy()) as BondingShare;
      await manager.connect(admin).setBondingShareAddress(bondingShare.address);

      const bondingShareAddr = BigNumber.from(
        await ethers.provider.getStorageAt(manager.address, 7)
      ).toHexString();

      expect(bondingShare.address.toLowerCase()).to.equal(
        bondingShareAddr.toLowerCase()
      );
    });
  });
  describe("uADTokenAddress", () => {
    it("Set should work", async () => {
      await manager.connect(admin).setuADTokenAddress(uAD.address);

      const uADTokenAddr = BigNumber.from(
        await ethers.provider.getStorageAt(manager.address, 3)
      ).toHexString();

      expect(uAD.address.toLowerCase()).to.equal(uADTokenAddr.toLowerCase());
    });
  });
  describe("debtCouponAddress", () => {
    it("Set should work", async () => {
      await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);

      const debtCouponAddr = BigNumber.from(
        await ethers.provider.getStorageAt(manager.address, 2)
      ).toHexString();

      expect(debtCoupon.address.toLowerCase()).to.equal(
        debtCouponAddr.toLowerCase()
      );
    });
  });
  describe("StablePool", () => {
    beforeEach(async () => {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [curveWhaleAddress],
      });
      const curveWhale = ethers.provider.getSigner(curveWhaleAddress);
      const crvToken = (await ethers.getContractAt(
        "ERC20",
        curve3CrvToken
      )) as ERC20;
      await crvToken
        .connect(curveWhale)
        .transfer(manager.address, ethers.utils.parseEther("10000"));
      // setuADTokenAddress needed for the stable pool
      await manager.connect(admin).setuADTokenAddress(uAD.address);
      // the uADManager needs some uAD to provide liquidity
      await uAD
        .connect(admin)
        .mint(manager.address, ethers.utils.parseEther("10000"));
      await manager
        .connect(admin)
        .deployStableSwapPool(
          curveFactory,
          curve3CrvBasePool,
          crvToken.address,
          10,
          4000000
        );
    });
    it("should deploy", async () => {
      const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
      const metaPoolAddrFromStorage = BigNumber.from(
        await ethers.provider.getStorageAt(manager.address, 8)
      ).toHexString();

      expect(metaPoolAddr.toLowerCase()).to.equal(
        metaPoolAddrFromStorage.toLowerCase()
      );
    });
    it("should return correct price", async () => {
      const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
      const metaPoolAddrFromStorage = BigNumber.from(
        await ethers.provider.getStorageAt(manager.address, 8)
      ).toHexString();

      expect(metaPoolAddr.toLowerCase()).to.equal(
        metaPoolAddrFromStorage.toLowerCase()
      );
    });
  });
});
