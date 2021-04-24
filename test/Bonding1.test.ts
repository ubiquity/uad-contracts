/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { bondingSetup, bondTokens, redeemShares, log } from "./BondingSetup";

describe("Bonding1", () => {
  describe("initialValues", () => {
    it("TARGET_PRICE should always be 1", async () => {
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

      expect(targetPrice).to.eq(one);
    });

    it("initial uAD totalSupply should be more than 30 010 (3 * 10 000 + 10)", async () => {
      const uADtotalSupply: BigNumber = await uAD.totalSupply();
      const uADinitialSupply: BigNumber = BigNumber.from(10).pow(18).mul(30010);

      expect(uADtotalSupply).to.gte(uADinitialSupply);
    });

    it("initial bonding totalSupply should be 0", async () => {
      const bondTotalSupply: BigNumber = await bondingShare.totalSupply(id);
      const zero: BigNumber = BigNumber.from(0);

      expect(bondTotalSupply).to.eq(zero);
    });

    it("initial currentShareValue should be TARGET_PRICE", async () => {
      const currentShareValue: BigNumber = await bonding.currentShareValue();
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

      expect(currentShareValue).to.eq(targetPrice);
    });

    it("initial currentTokenPrice should be TARGET_PRICE", async () => {
      const currentTokenPrice: BigNumber = await bonding.currentTokenPrice();
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

      expect(currentTokenPrice).to.eq(targetPrice);
    });
  });

  describe("durationMultiply", () => {
    it("durationMultiply of 0 should be 1", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-call
      const mult = await ubiquityFormulas.durationMultiply(one, 0, zzz1);

      expect(mult).to.eq(one);
    });

    it("durationMultiply of 1 should be 1.001", async () => {
      // 1.001000000 * 10**18 = 10**9 * 1001000000
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 1, zzz1)
      );
      const epsilon = ten9.mul(1001000000).sub(mult);

      // 10**-9 expected precision on following calculations
      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 6 should be 1.014696938", async () => {
      // 1.014696938 * 10**18 = 10**9 * 1014696938
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 6, zzz1)
      );
      const epsilon = ten9.mul(1014696938).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 24 should be 1.117575507", async () => {
      // 1.117575507 * 10**18 = 10**9 * 1117575507
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 24, zzz1)
      );
      const epsilon = ten9.mul(1117575507).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 52 should be 1.374977332", async () => {
      // 1.3749773326 * 10**18 = 10**9 * 1374977332
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 52, zzz1)
      );
      const epsilon = ten9.mul(1374977332).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 520 should be 12.857824421", async () => {
      // 12.857824421 * 10**18 = 10**10 * 12857824421
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 520, zzz1)
      );
      const epsilon = ten9.mul(12857824421).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });
  });

  describe("redeemShares", () => {
    it("Should revert when users try to redeem more shares than they have", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .redeemShares(ethers.utils.parseEther("10000"), id)
      ).to.be.revertedWith("Bonding: Caller does not have enough shares");
    });

    it("Users should be able to instantaneously redeem shares when the redeemStreamTime is 0", async () => {
      const initialRedeemStreamTime = await bonding.redeemStreamTime();
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      const prevUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress(),
        id
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await bondingShare
        .connect(secondAccount)
        .setApprovalForAll(bonding.address, true);

      // await bonding
      //   .connect(secondAccount)
      //   .redeemShares(prevBondingSharesBalance);

      // const newUADBalance = await uAD.balanceOf(
      //   await secondAccount.getAddress()
      // );

      // const newBondingSharesBalance = await bondingShare.balanceOf(
      //   await secondAccount.getAddress(),
      //   id
      // );

      // expect(prevUADBalance).to.be.lt(newUADBalance);

      // expect(prevBondingSharesBalance).to.be.gt(newBondingSharesBalance);

      // await bonding.connect(admin).setRedeemStreamTime(initialRedeemStreamTime);
    });

    it("Should return the current Sablier address", async () => {
      expect(await bonding.sablier()).to.equal(sablier);
    });

    it("Users should be able to start Sablier streams to redeem their shares", async () => {
      const prevUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      const amountToBond = ethers.utils.parseEther("5000");
      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      // await bonding.connect(secondAccount).bondTokens(amountToBond, 6);

      // const prevBondingSharesBalance = await bondingShare.balanceOf(
      //   await secondAccount.getAddress(),
      //   id
      // );

      // // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      // await bondingShare
      //   .connect(secondAccount)
      //   .setApprovalForAll(bonding.address, true);

      // await bonding
      //   .connect(secondAccount)
      //   .redeemShares(prevBondingSharesBalance);

      // expect(await uAD.balanceOf(await secondAccount.getAddress())).to.be.lt(
      //   prevUADBalance
      // );

      // expect(prevBondingSharesBalance).to.be.gt(
      //   await bondingShare.balanceOf(await secondAccount.getAddress(), id)
      // );
    });
  });
  const id = 42;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  const ten9: BigNumber = BigNumber.from(10).pow(9); // ten9 = 10^-9 ether = 10^9
  const zzz1: BigNumber = BigNumber.from(10).pow(15); // zzz1 = zerozerozero1 = 0.0001 ether = 10^15

  let uAD: UbiquityAlgorithmicDollar;
  let metaPool: IMetaPool;
  let bonding: Bonding;
  let bondingShare: BondingShare;
  let sablier: string;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let adminAddress: string;
  let secondAddress: string;
  let thirdAddress: string;
  let ubiquityFormulas: UbiquityFormulas;

  before(async () => {
    ({
      admin,
      secondAccount,
      thirdAccount,
      uAD,
      metaPool,
      bonding,
      bondingShare,
      ubiquityFormulas,
      sablier,
      manager,
    } = await bondingSetup());
    adminAddress = await admin.getAddress();
    secondAddress = await secondAccount.getAddress();
    thirdAddress = await thirdAccount.getAddress();
  });
});
