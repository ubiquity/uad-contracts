/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";
import { mineNBlock, mineTsBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";

describe("Bonding3", () => {
  const one: BigNumber = BigNumber.from(10).pow(18);
  const ten9: BigNumber = BigNumber.from(10).pow(9);

  let secondAccount: Signer;
  let secondAddress: string;
  let bonding: Bonding;
  let bondingShare: BondingShare;
  let metaPool: IMetaPool;

  before(async () => {
    ({ secondAccount, bondingShare, metaPool } = await bondingSetup());
    secondAddress = await secondAccount.getAddress();
  });

  describe("Bonding3", () => {
    let id: number;
    let lp0: BigNumber;
    let lp1: BigNumber;

    // uLP = 1000
    // uBOND = 0
    it("second account should be able to bound for 6 weeks", async () => {
      lp0 = await metaPool.balanceOf(secondAddress);
      id = await bondTokens(secondAccount, one.mul(100), 6);

      const bond: BigNumber = await bondingShare.balanceOf(secondAddress, id);
      const epsilon = ten9.mul(101469693845).sub(bond);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });
    // uLP = 900
    // uBOND = 101.469
    it("second account should not be able to redeem before 6 weeks", async () => {
      await expect(redeemShares(secondAccount, id)).to.be.revertedWith(
        "Bonding: Redeem not allowed before bonding time"
      );
    });
    // uLP = 900
    // uBOND = 101.469
    it("second account should be able to redeem after 6 weeks", async () => {
      await mineTsBlock(6 * 604800 - 10);
      await expect(redeemShares(secondAccount, id)).to.be.revertedWith(
        "Bonding: Redeem not allowed before bonding time"
      );
      await mineTsBlock(10);
      await redeemShares(secondAccount, id);
      lp1 = await metaPool.balanceOf(secondAddress);

      expect(await bondingShare.balanceOf(secondAddress, id)).to.be.equal(0);
      expect(await metaPool.balanceOf(secondAddress)).to.be.gte(100);
      expect(lp1.sub(lp0).sub(ten9.mul(1469693845)).div(ten9)).to.be.equal(0);
    });
    //   uLP = 1001.469...
    // uBOND = 0

    // it("second account and second account should be able to bound on same block", async () => {
    //   // const block: BigNumber = BigNumber.from(
    //   //   await ethers.provider.getBlockNumber()
    //   // );
    //   const block = await ethers.provider.getBlockNumber();
    //   expect(await bondTokens(secondAccount, one.mul(100), 0, block)).to.be.equal(
    //     one.mul(100)
    //   );
  });
});
