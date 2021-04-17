import { Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

describe("UbiquityAlgorithmicDollar", () => {
  let admin: Signer;
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;

  beforeEach(async () => {
    [admin, secondAccount, thirdAccount] = await ethers.getSigners();
    const Manager = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    const manager = (await Manager.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
  });
  describe("Transfer", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      const thirdAdr = await thirdAccount.getAddress();
      await uAD.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      // transfer uad
      await uAD
        .connect(secondAccount)
        .transfer(thirdAdr, ethers.utils.parseEther("42"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("9958")
      );
      expect(await uAD.connect(thirdAdr).balanceOf(thirdAdr)).to.equal(
        ethers.utils.parseEther("42")
      );
    });
    it("should fail if balance is insufficient", async () => {
      const sndAdr = await secondAccount.getAddress();
      const thirdAdr = await thirdAccount.getAddress();
      await uAD.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      // transfer uad
      await expect(
        uAD
          .connect(secondAccount)
          .transfer(thirdAdr, ethers.utils.parseEther("10000.0000000001"))
      ).to.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });
  describe("Mint", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      await uAD.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
    });
    it("should fail if not Minter Role", async () => {
      const thirdAdr = await thirdAccount.getAddress();
      // transfer uad
      await expect(
        uAD
          .connect(secondAccount)
          .mint(thirdAdr, ethers.utils.parseEther("10000"))
      ).to.revertedWith("UBQ token: not minter");
    });
  });
  describe("Burn", () => {
    it("should work", async () => {
      const sndAdr = await secondAccount.getAddress();
      await uAD.connect(admin).mint(sndAdr, ethers.utils.parseEther("10000"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("10000")
      );
      await uAD.connect(secondAccount).burn(ethers.utils.parseEther("10000"));
      expect(await uAD.connect(secondAccount).balanceOf(sndAdr)).to.equal(
        ethers.utils.parseEther("0")
      );
    });
    it("should fail if balance is insufficient", async () => {
      await expect(
        uAD.connect(secondAccount).burn(ethers.utils.parseEther("10000"))
      ).to.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
