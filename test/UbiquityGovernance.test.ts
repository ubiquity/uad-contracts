import { Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

describe("UbiquityGovernance", () => {
  let admin: Signer;
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let manager: UbiquityAlgorithmicDollarManager;
  let uGOV: UbiquityGovernance;

  beforeEach(async () => {
    [admin, secondAccount, thirdAccount] = await ethers.getSigners();
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const UGOV = await ethers.getContractFactory("UbiquityGovernance");
    uGOV = (await UGOV.deploy(manager.address)) as UbiquityGovernance;
  });
  describe("Transfer", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      const thirdAdr = await thirdAccount.getAddress();
      await uGOV.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      // transfer uGOV
      await uGOV
        .connect(secondAccount)
        .transfer(thirdAdr, ethers.utils.parseEther("42"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("9958")
      );
      expect(await uGOV.connect(thirdAdr).balanceOf(thirdAdr)).to.equal(
        ethers.utils.parseEther("42")
      );
    });
    it("should fail if balance is insufficient", async () => {
      const sndAdr = await secondAccount.getAddress();
      const thirdAdr = await thirdAccount.getAddress();
      await uGOV.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      // transfer uGOV
      await expect(
        uGOV
          .connect(secondAccount)
          .transfer(thirdAdr, ethers.utils.parseEther("10000.0000000001"))
      ).to.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });
  describe("Mint", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      await uGOV.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
    });
    it("should fail if not Minter Role", async () => {
      const thirdAdr = await thirdAccount.getAddress();
      // transfer uGOV
      await expect(
        uGOV
          .connect(secondAccount)
          .mint(thirdAdr, ethers.utils.parseEther("10000"))
      ).to.revertedWith("UBQ token: not minter");
    });
  });
  describe("Burn", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      await uGOV.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      await uGOV.connect(secondAccount).burn(ethers.utils.parseEther("10000"));
      expect(await uGOV.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("0")
      );
    });
    it("should fail if balance is insufficient", async () => {
      await expect(
        uGOV.connect(secondAccount).burn(ethers.utils.parseEther("10000"))
      ).to.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
