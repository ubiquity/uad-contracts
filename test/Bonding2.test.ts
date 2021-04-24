/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { BondingShare } from "../artifacts/types/BondingShare";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { Bonding } from "../artifacts/types/Bonding";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";

describe("Bonding2", () => {
  describe("Bonding and Redeem", () => {
    it("admin should have some uLP tokens", async () => {
      expect(await metaPool.balanceOf(adminAddress)).to.be.gt(one.mul(1000));
    });

    it("second account should have some uLP tokens", async () => {
      expect(await metaPool.balanceOf(secondAddress)).to.be.gt(one.mul(1000));
    });

    it("third account should have no uLP tokens", async () => {
      expect(await metaPool.balanceOf(thirdAddress)).to.be.equal(0);
    });

    it("admin should be able to bound", async () => {
      expect(await bondTokens(admin, one.mul(100), 0, id)).to.be.equal(
        one.mul(100)
      );
      // console.log("total uLP", log(await metaPool.balanceOf(bonding.address)));
    });
    // uLP = 100
    // uBOND = 100

    it("second account should be able to bound", async () => {
      expect(await bondTokens(secondAccount, one.mul(100), 0, id)).to.be.equal(
        one.mul(50)
      );
    });
    // uLP = 200
    // uBOND = 150

    it("third account should not be able to bound", async () => {
      await expect(
        bondTokens(thirdAccount, BigNumber.from(1), 1, id)
      ).to.be.revertedWith("revert SafeERC20: low-level call failed");
    });

    it("total uLP should be 200", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.equal(one.mul(200));
    });

    it("total uBOND should be 150", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(one.mul(150));
    });

    it("admin account should be able to redeem uBOND", async () => {
      await redeemShares(admin, id);
      expect(await bondingShare.balanceOf(adminAddress, id)).to.be.equal(0);
    });
    // uLP = 100
    // uBOND = 50

    it("second account should be able to redeem uBOND", async () => {
      await redeemShares(secondAccount, id);
      expect(await bondingShare.balanceOf(secondAddress, id)).to.be.equal(0);
    });
    // uLP = 0
    // uBOND = 0

    it("third account should be able to redeem uBOND", async () => {
      await redeemShares(thirdAccount, id);
      expect(await bondingShare.balanceOf(thirdAddress, id)).to.be.equal(0);
    });

    it("total uBOND should be 0 after redeem", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(0);
    });

    it("total uLP should be 0 after redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.lt(ten9);
    });
  });

  describe("UseCase bond uLP tokens and immediate withdraw", () => {
    it("deposit 100 LPs tokens for 6 weeks should give 101.469693845 bond tokens", async () => {
      const deltaBond: BigNumber = await bondTokens(
        secondAccount,
        one.mul(100),
        6,
        id
      );
      expect(deltaBond.sub(ten9.mul(101469693845)).abs()).to.be.lt(ten9);
    });
    // uLP = 100
    // uBOND = 100.469693845

    it("redeemShares should give back 100 LPs tokens", async () => {
      const deltaBalLp: BigNumber = await redeemShares(secondAccount, id);
      expect(deltaBalLp.add(one.mul(100)).abs()).to.be.lt(ten9);
    });
    // uLP = 0
    // uBOND = 0

    it("total uBOND should be 0 after redeem", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(0);
    });

    it("total uLP should be 0 after redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.lt(ten9);
    });
  });

  const id = 42;
  const one: BigNumber = BigNumber.from(10).pow(18);
  const ten9: BigNumber = BigNumber.from(10).pow(9);

  let metaPool: IMetaPool;
  let bonding: Bonding;
  let bondingShare: BondingShare;
  let admin: Signer;
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let adminAddress: string;
  let secondAddress: string;
  let thirdAddress: string;

  before(async () => {
    ({
      admin,
      secondAccount,
      thirdAccount,
      metaPool,
      bonding,
      bondingShare,
    } = await bondingSetup());
    adminAddress = await admin.getAddress();
    secondAddress = await secondAccount.getAddress();
    thirdAddress = await thirdAccount.getAddress();
  });
});
