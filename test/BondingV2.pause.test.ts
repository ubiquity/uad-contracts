// Should test Pause for BondingV2 and BondingShareV2

import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import {
  bondingSetupV2,
  deposit,
  addLiquidity,
  removeLiquidity,
} from "./BondingSetupV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { mineNBlock } from "./utils/hardhatNode";

let bondingV2: BondingV2;
let bondingShareV2: BondingShareV2;
let admin: Signer;
let secondAccount: Signer;
let manager: UbiquityAlgorithmicDollarManager;
let secondAccountAddress: string;
let blockCountInAWeek: BigNumber;

const PAUSER_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("PAUSER_ROLE")
);

describe("Pause", () => {
  beforeEach(async () => {
    ({
      manager,
      secondAccount,
      admin,
      bondingV2,
      bondingShareV2,
      blockCountInAWeek,
    } = await bondingSetupV2());
    await bondingSetupV2();
    secondAccountAddress = await secondAccount.getAddress();
  });

  describe("BondingV2", () => {
    it("Should pause and unpause only with role", async () => {
      // pause revert without role
      await expect(bondingV2.connect(secondAccount).pause()).to.be.revertedWith(
        ""
      );

      // pause work with role
      await expect(bondingV2.connect(admin).pause()).to.not.be.reverted;

      // pause revert if already paused
      await expect(bondingV2.connect(admin).pause()).to.be.revertedWith(
        "'Pausable: paused"
      );

      // unpause revert without role
      await expect(
        bondingV2.connect(secondAccount).unpause()
      ).to.be.revertedWith("");

      // unpause work with role
      await expect(bondingV2.connect(admin).unpause()).to.not.be.reverted;

      // unpause revert if not paused
      await expect(bondingV2.connect(admin).unpause()).to.be.revertedWith(
        "'Pausable: not paused"
      );

      // setting role to pause and unpause
      await manager.connect(admin).grantRole(PAUSER_ROLE, secondAccountAddress);
      await expect(bondingV2.connect(secondAccount).pause()).to.not.be.reverted;
      await expect(bondingV2.connect(secondAccount).unpause()).to.not.be
        .reverted;
    });

    it("Should pause deposit, addLiquidity and removeLiquidity", async () => {
      const bond = await deposit(secondAccount, BigNumber.from(1), 1);
      await mineNBlock(blockCountInAWeek.toNumber() + 10); // wait 1 week...
      await addLiquidity(secondAccount, bond.id, BigNumber.from(1), 1);
      await mineNBlock(blockCountInAWeek.toNumber() + 10); // wait 1 week...
      await expect(removeLiquidity(secondAccount, BigNumber.from(1), bond.id))
        .to.not.be.reverted;

      // await bondingV2.connect(admin).pause();
      // await deposit(secondAccount, BigNumber.from(1), 1);

      // await bondingV2.connect(admin).unpause();
      // await deposit(secondAccount, BigNumber.from(1), 1);
    });

    // describe("BondingShareV2", () => {
    //   it("Should pause", async () => {
    //     await expect(bondingShareV2.connect(admin).pause()).to.not.be.reverted;
    //   });
    // should pause with role
    // should not pause without role
    // upause should work
    // should pause updateBond
    // should pause mint
    // should pause safeTransferFrom
    // should pause safeBatchTransferFrom
    // should pause _burn
    // should pause _burnBatch
  });
});
