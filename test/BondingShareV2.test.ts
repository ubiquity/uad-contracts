import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { bondingSetupV2, deposit } from "./BondingSetupV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { mineNBlock } from "./utils/hardhatNode";

describe("bondingShareV2", () => {
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let thirdAdr: string;
  let secondAdr: string;
  let metaPool: IMetaPool;
  let admin: Signer;
  let bondingShareV2: BondingShareV2;
  let bondingV2: BondingV2;
  let manager: UbiquityAlgorithmicDollarManager;
  before(async () => {
    ({
      admin,
      secondAccount,
      bondingV2,
      thirdAccount,
      metaPool,
      manager,
      bondingShareV2,
    } = await bondingSetupV2());
    thirdAdr = await thirdAccount.getAddress();
    secondAdr = await secondAccount.getAddress();
  });
  describe("pausable", () => {
    it("admin should be token manager", async () => {
      const hasRole = await manager.hasRole(
        await manager.BONDING_MANAGER_ROLE(),
        await admin.getAddress()
      );
      expect(hasRole).to.be.true;
    });
    it("should revert if non manager pause", async () => {
      await expect(
        bondingShareV2.connect(secondAccount).pause()
      ).to.be.revertedWith("not manager");
    });
    it("bondingShareV2 shouldn't be able to unpause if not paused", async () => {
      await expect(bondingShareV2.connect(admin).unpause()).to.be.revertedWith(
        "Pausable: not paused"
      );
    });
    it("bondingShareV2 should be able to pause", async () => {
      await expect(bondingShareV2.connect(admin).pause()).to.emit(
        bondingShareV2,
        "Paused"
      );
      await expect(
        bondingShareV2
          .connect(secondAccount)
          .safeTransferFrom(
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            42,
            421,
            ethers.utils.toUtf8Bytes("yolo")
          )
      ).to.be.revertedWith("Pausable: paused");
    });
    it("bondingShareV2 should be able to unpause", async () => {
      await expect(bondingShareV2.connect(admin).unpause()).to.emit(
        bondingShareV2,
        "Unpaused"
      );
      const amount = BigNumber.from(10).pow(18);
      const { id } = await deposit(secondAccount, amount, 1);

      await bondingShareV2
        .connect(secondAccount)
        .safeTransferFrom(
          await secondAccount.getAddress(),
          await admin.getAddress(),
          1,
          id,
          ethers.utils.toUtf8Bytes("")
        );
    });
  });
  describe("transfer", () => {
    let shareId: BigNumber;
    let lpAmount: BigNumber;

    it("should revert if not owner", async () => {
      const amount = BigNumber.from(10).pow(18).mul(99);
      const { id, bsAmount } = await deposit(secondAccount, amount, 1);
      shareId = id;
      lpAmount = bsAmount;
      let balsecond = await bondingShareV2.balanceOf(secondAdr, shareId);
      expect(balsecond).to.equal(1);

      await expect(
        bondingShareV2
          .connect(thirdAccount)
          .safeTransferFrom(
            await secondAccount.getAddress(),
            await admin.getAddress(),
            1,
            id,
            ethers.utils.toUtf8Bytes("")
          )
      ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
      balsecond = await bondingShareV2.balanceOf(secondAdr, shareId);
      expect(balsecond).to.equal(1);
    });
    it("should transfer if approved", async () => {
      await bondingShareV2
        .connect(secondAccount)
        .setApprovalForAll(thirdAdr, true);

      await bondingShareV2
        .connect(thirdAccount)
        .safeTransferFrom(
          secondAdr,
          thirdAdr,
          1,
          shareId,
          ethers.utils.toUtf8Bytes("")
        );
      const balthird = await bondingShareV2.balanceOf(thirdAdr, shareId);
      const balsecond = await bondingShareV2.balanceOf(secondAdr, shareId);
      expect(balsecond).to.equal(0);
      expect(balthird).to.equal(1);
    });

    it("should be able to remove liquidity", async () => {
      const amount = BigNumber.from(10).pow(18).mul(100);
      const { id } = await deposit(secondAccount, amount, 1);
      const lpBalBefore = await metaPool.balanceOf(thirdAdr);
      const blockCountInAWeek = await bondingV2.blockCountInAWeek();
      await mineNBlock(blockCountInAWeek.toNumber());
      await bondingV2.connect(thirdAccount).removeLiquidity(lpAmount, shareId);
      const lpBalAfter = await metaPool.balanceOf(thirdAdr);
      expect(lpBalAfter).to.equal(lpBalBefore.add(lpAmount));
    });
  });
});
