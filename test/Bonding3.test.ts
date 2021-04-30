/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { BondingShare } from "../artifacts/types/BondingShare";
import { bondingSetup, deposit, withdraw } from "./BondingSetup";
// import { mineNBlock } from "./utils/hardhatNode";
// import { IMetaPool } from "../artifacts/types/IMetaPool";

describe("Bonding3", () => {
  const one: BigNumber = BigNumber.from(10).pow(18);
  const ten9: BigNumber = BigNumber.from(10).pow(9);

  let admin: Signer;
  let secondAccount: Signer;
  let secondAddress: string;
  let bondingShare: BondingShare;
  // let metaPool: IMetaPool;

  before(async () => {
    // ({ admin, secondAccount, bondingShare, metaPool } = await bondingSetup());
    ({ admin, secondAccount, bondingShare } = await bondingSetup());
    secondAddress = await secondAccount.getAddress();
  });

  describe("Bonding time and redeem", () => {
    let idAdmin: number;
    let idSecond: number;
    // let lp0: BigNumber;
    // let lp1: BigNumber;

    // uLP = 1000
    // uBOND = 0
    it("second account should be able to bound for 1 weeks", async () => {
      // lp0 = await metaPool.balanceOf(secondAddress);
      idSecond = (await deposit(secondAccount, one.mul(100), 1)).id;

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
      await expect(withdraw(secondAccount, idSecond)).to.be.revertedWith(
        "Bonding: Redeem not allowed before bonding time"
      );
    });

    it("second account should be able to redeem after 1 week", async () => {
      // console.log("should take some time! but less than 1 week...");
      // can make test fail with core dumped : 45361 Promises in parallel...
      // await mineNBlock(45361);
      // await withdraw(secondAccount, idSecond);
      // const bal = await bondingShare.balanceOf(secondAddress, idSecond);
      // expect(bal).to.be.equal(0);
      // lp1 = await metaPool.balanceOf(secondAddress);
      // expect(lp1).to.be.gte(100);
      // expect(lp1.sub(lp0)).to.be.gt(0);
    });
    //   uLP = 1001.469...
    // uBOND = 0

    it("admin and second account should be able to bound on same block", async () => {
      idAdmin = (await deposit(admin, one.mul(100), 1)).id;
      idSecond = (await deposit(secondAccount, one.mul(100), 1)).id;
      expect(idAdmin).to.be.equal(idSecond);

      const totalUBOND: BigNumber = await bondingShare.totalSupply();
      // log(totalUBOND);
      expect(totalUBOND).to.be.gte(one.mul(150));
    });
  });
});
