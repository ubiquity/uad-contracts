/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { BondingShare } from "../artifacts/types/BondingShare";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { Bonding } from "../artifacts/types/Bonding";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";
import { mineNBlock } from "./utils/hardhatNode";

describe("Bonding2", () => {
  let idAdmin: number;
  let idSecond: number;

  describe("Bonding and Redeem", () => {
    it("admin should have some uLP tokens", async () => {
      const bal = await metaPool.balanceOf(adminAddress);
      expect(bal).to.be.gte(one.mul(1000));
    });

    it("second account should have some uLP tokens", async () => {
      const bal = await metaPool.balanceOf(secondAddress);
      expect(bal).to.be.gte(one.mul(1000));
    });

    it("third account should have no uLP tokens", async () => {
      expect(await metaPool.balanceOf(thirdAddress)).to.be.equal(0);
    });

    it("total uLP of bonding contract should start at 100", async () => {
      const bal = await metaPool.balanceOf(bonding.address);
      expect(bal).to.be.equal(one.mul(100));
    });
    // uLP = 100
    // uBOND = 0

    it("total uBOND should be 0", async () => {
      const totalUBOND = await bondingShare.totalSupply();
      expect(totalUBOND).to.be.equal(0);
    });

    it("admin should be able to bound", async () => {
      const { id, bond } = await bondTokens(admin, one.mul(100), 1);
      idAdmin = id;
      // console.log("idAdmin", idAdmin);
      // log(bond);
      expect(bond).to.be.gte(one.mul(100));
      // console.log("total uLP", log(await metaPool.balanceOf(bonding.address)));
    });
    // uLP = 200
    // uBOND = 100.1

    it("total uBOND should be 100.1", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply();
      // log(totalUBOND);
      expect(totalUBOND).to.be.gte(one.mul(100));
    });

    it("second account should be able to bound", async () => {
      const { id, bond } = await bondTokens(secondAccount, one.mul(100), 1);
      idSecond = id;
      // console.log("idSecond", idSecond);

      // log(bond);
      expect(bond).to.be.gte(one.mul(33));
    });
    // uLP = 300
    // uBOND = 133.5

    it("third account should not be able to bound", async () => {
      await expect(
        bondTokens(thirdAccount, BigNumber.from(1), 1)
      ).to.be.revertedWith("revert SafeERC20: low-level call failed");
    });

    it("total uLP should be 300", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      // log(totalLP);
      expect(totalLP).to.be.equal(one.mul(300));
    });

    it("total uBOND should be more than 133", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply();
      // log(totalUBOND);
      expect(totalUBOND).to.be.gte(one.mul(133));
    });

    it("admin account should be able to redeem uBOND", async () => {
      await mineNBlock(45361);

      await redeemShares(admin, idAdmin);
      const bal = await bondingShare.balanceOf(adminAddress, idAdmin);
      expect(bal).to.be.equal(0);
    });
    // uLP = 200
    // uBOND = 33.4

    it("total uLP should be 75 after first redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      // log(totalLP);
      expect(totalLP).to.be.gte(one.mul(75));
    });

    it("second account should be able to redeem uBOND", async () => {
      await redeemShares(secondAccount, idSecond);
      const bal = await bondingShare.balanceOf(secondAddress, idSecond);
      // log(bal);
      expect(bal).to.be.equal(0);
    });
    // uLP = 1000
    // uBOND = 0

    it("third account should be able to redeem uBOND", async () => {
      await redeemShares(thirdAccount, idAdmin);
      expect(await bondingShare.balanceOf(thirdAddress, idAdmin)).to.be.equal(
        0
      );
    });

    it("total uLP should be 0 after all redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      // log(totalLP);
      expect(totalLP).to.be.lt(ten9);
    });

    it("total uBOND should be 0 after all redeem", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply();
      expect(totalUBOND).to.be.equal(0);
    });
  });

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
