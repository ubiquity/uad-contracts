/* eslint-disable @typescript-eslint/no-use-before-define */

import { ethers, Signer } from "ethers";
import { describe, it } from "mocha";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { BondingShare } from "../artifacts/types/BondingShare";
import { Bonding } from "../artifacts/types/Bonding";
import { bondingSetup, log } from "./BondingSetup";

describe("Bonding", () => {
  describe("CollectableDust", () => {
    it("Admin should be able to add protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).addProtocolToken(USDC);
    });

    it("Should revert when another account tries to add protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).addProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should revert when trying to add an already existing protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).addProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-is-part-of-the-protocol");
    });

    it("Should revert when another account tries to remove a protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).removeProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Admin should be able to remove protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).removeProtocolToken(USDC);
    });

    it("Should revert when trying to remove token that is not a part of the protocol (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).removeProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-not-part-of-the-protocol");
    });

    it("Admin should be able to send dust from the contract (CollectableDust)", async () => {
      // Send ETH to the Bonding contract
      await secondAccount.sendTransaction({
        to: bonding.address,
        value: ethers.utils.parseUnits("100", "gwei"),
      });

      // Send dust back to the admin
      await bonding
        .connect(admin)
        .sendDust(
          await admin.getAddress(),
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });

    it("Should emit DustSent event (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(admin)
          .sendDust(
            await admin.getAddress(),
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("50", "gwei")
          )
      )
        .to.emit(bonding, "DustSent")
        .withArgs(
          await admin.getAddress(),
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });
    it("Should revert when another account tries to remove dust from the contract (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .sendDust(
            await admin.getAddress(),
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("100", "gwei")
          )
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit ProtocolTokenAdded event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).addProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenAdded")
        .withArgs(DAI);
    });

    it("Should emit ProtocolTokenRemoved event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).removeProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenRemoved")
        .withArgs(DAI);
    });
  });

  describe("maxBondingPrice", () => {
    it("Admin should be able to update the maxBondingPrice", async () => {
      await bonding
        .connect(admin)
        .setMaxBondingPrice(ethers.constants.MaxUint256);
      expect(await bonding.maxBondingPrice()).to.equal(
        ethers.constants.MaxUint256
      );
    });

    it("Should revert when unauthorized accounts try to update the maxBondingPrice", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setMaxBondingPrice(ethers.constants.MaxUint256)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the MaxBondingPriceUpdated event", async () => {
      await expect(
        bonding.connect(admin).setMaxBondingPrice(ethers.constants.MaxUint256)
      )
        .to.emit(bonding, "MaxBondingPriceUpdated")
        .withArgs(ethers.constants.MaxUint256);
    });
  });

  describe("bondingDiscountMultiplier", () => {
    it("Admin should be able to update the bondingDiscountMultiplier", async () => {
      await bonding
        .connect(admin)
        .setBondingDiscountMultiplier(ethers.BigNumber.from(2));
      expect(await bonding.bondingDiscountMultiplier()).to.equal(
        ethers.BigNumber.from(2)
      );
    });

    it("Should revert when unauthorized accounts try to update the bondingDiscountMultiplier", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the BondingDiscountMultiplierUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      )
        .to.emit(bonding, "BondingDiscountMultiplierUpdated")
        .withArgs(ethers.BigNumber.from(2));
    });
  });

  describe("redeemStreamTime", () => {
    it("Admin should be able to update the redeemStreamTime", async () => {
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      expect(await bonding.redeemStreamTime()).to.equal(
        ethers.BigNumber.from("0")
      );
    });

    it("Should revert when unauthorized accounts try to update the redeemStreamTime", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setRedeemStreamTime(ethers.BigNumber.from(0))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the RedeemStreamTimeUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setRedeemStreamTime(ethers.BigNumber.from("604800"))
      )
        .to.emit(bonding, "RedeemStreamTimeUpdated")
        .withArgs(ethers.BigNumber.from("604800"));
    });
  });

  describe("StableSwap meta pool TWAP oracle", () => {
    it("Oracle should return the correct initial price", async () => {
      expect(await twapOracle.consult(uAD.address)).to.equal(
        ethers.utils.parseEther("1")
      );
    });
  });

  describe("bondTokens", () => {
    it("User should be able to bond uAD tokens", async () => {
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress(),
        id
      );
      const amountToBond = ethers.utils.parseEther("5000");

      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      // await metapool.connect(secondAccount).approve(bonding.address, amountToBond);

      // await bonding.connect(secondAccount).deposit(amountToBond, 6);

      // const newBondingSharesBalance = await bondingShare.balanceOf(
      //   await secondAccount.getAddress(),
      //   id
      // );
      // expect(newBondingSharesBalance).to.be.gt(prevBondingSharesBalance);
    });
  });

  describe("Sablier configuration", () => {
    it("Should return the current Sablier address", async () => {
      expect(await bonding.sablier()).to.equal(sablier);
    });

    it("admin should be able to update the Sablier address", async () => {
      await bonding.connect(admin).setSablier(ethers.constants.AddressZero);
      expect(await bonding.sablier()).to.equal(ethers.constants.AddressZero);
    });

    it("Should emit the SablierUpdated event", async () => {
      await expect(bonding.connect(admin).setSablier(DAI))
        .to.emit(bonding, "SablierUpdated")
        .withArgs(DAI);
    });

    it("Should revert when another account tries to update the Sablier address", async () => {
      await expect(
        bonding.connect(secondAccount).setSablier(ethers.constants.AddressZero)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });
  });

  const id = 42;

  let bonding: Bonding;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let sablier: string;
  let DAI: string;
  let USDC: string;
  let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;

  before(async () => {
    ({
      admin,
      secondAccount,
      uAD,
      bonding,
      bondingShare,
      twapOracle,
      sablier,
      DAI,
      USDC,
    } = await bondingSetup());
  });
});
