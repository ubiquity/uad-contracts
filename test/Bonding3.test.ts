/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { ethers } from "hardhat";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";

describe("Bonding3", () => {
  const one: BigNumber = BigNumber.from(10).pow(18);
  const ten9: BigNumber = BigNumber.from(10).pow(9);

  let admin: Signer;

  before(async () => {
    ({ admin } = await bondingSetup());
  });

  describe("Bonding3", () => {
    it("one should be ten18 or ten9^2", async () => {
      console.log(log(one));
      console.log(log(ten9));
      expect(ten9.mul(ten9)).to.be.equal(one);
    });

    it("admin should be able to bound", async () => {
      // const block: BigNumber = BigNumber.from(
      //   await ethers.provider.getBlockNumber()
      // );
      const block = await ethers.provider.getBlockNumber();
      expect(await bondTokens(admin, one.mul(100), 0, block)).to.be.equal(
        one.mul(100)
      );

      // console.log("total uLP", log(await metaPool.balanceOf(bonding.address)));
    });

    // it("admin should be able to bound", async () => {
    //   const blockBefore = await ethers.provider.getBlockNumber();
    //   await mineNBlock(10);
    //   const blockAfter = await ethers.provider.getBlockNumber();
    //   console.log("blockBefore", blockBefore);
    //   console.log("blockAfter ", blockAfter);
    // });
  });
});
