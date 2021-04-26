/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";

describe("Bonding3", () => {
  const one: BigNumber = BigNumber.from(10).pow(18);
  const ten9: BigNumber = BigNumber.from(10).pow(9);

  let admin: Signer;
  let secondAccount: Signer;
  let adminAddress: string;
  let secondAddress: string;
  let bonding: Bonding;
  let bondingShare: BondingShare;
  let metaPool: IMetaPool;

  before(async () => {
    ({ admin, secondAccount, bondingShare, metaPool } = await bondingSetup());
    adminAddress = await admin.getAddress();
    secondAddress = await secondAccount.getAddress();
  });

  describe("Bonding3", () => {
    let idAdmin: number;
    let idSecond: number;
    let lp0: BigNumber;
    let lp1: BigNumber;

    // uLP = 1000
    // uBOND = 0
    it("second account should be able to bound for 1 weeks", async () => {
      lp0 = await metaPool.balanceOf(secondAddress);
      idSecond = (await bondTokens(secondAccount, one.mul(100), 1)).id;

      const bond: BigNumber = await bondingShare.balanceOf(
        secondAddress,
        idSecond
      );
      const epsilon = ten9.mul(100100000000).sub(bond);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });
    // uLP = 900
    // uBOND = 101.469
    it("second account should not be able to redeem before 1 week", async () => {
      await expect(redeemShares(secondAccount, idSecond)).to.be.revertedWith(
        "Bonding: Redeem not allowed before bonding time"
      );
    });

    it("second account should be able to redeem after 1 week", async () => {
      console.log("should take some time! but less than 1 week...");
      await mineNBlock(45361);
      await redeemShares(secondAccount, idSecond);

      const bal = await bondingShare.balanceOf(secondAddress, idSecond);
      expect(bal).to.be.equal(0);

      lp1 = await metaPool.balanceOf(secondAddress);
      expect(lp1).to.be.gte(100);
      expect(lp1.sub(lp0)).to.be.gt(0);
    });
    //   uLP = 1001.469...
    // uBOND = 0

    it("admin and second account should be able to bound on same block", async () => {
      idAdmin = (await bondTokens(admin, one.mul(100), 1)).id;
      idSecond = (await bondTokens(secondAccount, one.mul(100), 1)).id;
      expect(idAdmin).to.be.equal(idSecond);

      const totalUBOND: BigNumber = await bondingShare.totalSupply();
      log(totalUBOND);
      expect(totalUBOND).to.be.gte(one.mul(150));
    });
  });
});
