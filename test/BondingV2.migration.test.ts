import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { bondingSetupV2 } from "./BondingSetupV2";

type Bond = [string, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] & {
  minter: string;
  lpFirstDeposited: BigNumber;
  creationBlock: BigNumber;
  lpRewardDebt: BigNumber;
  endBlock: BigNumber;
  lpAmount: BigNumber;
};

let bondingV2: BondingV2;
let bondingShareV2: BondingShareV2;
let secondAccount: Signer;
let bondingZeroAccount: Signer;
let bondingMinAccount: Signer;
let bondingMaxAccount: Signer;
let bondingMinAddress: string;
let bondingMaxAddress: string;
let secondAddress: string;
let masterChefV2: MasterChefV2;
let admin: Signer;

beforeEach(async () => {
  ({
    admin,
    secondAccount,
    bondingV2,
    bondingShareV2,
    masterChefV2,
    bondingZeroAccount,
    bondingMinAccount,
    bondingMaxAccount
  } = await bondingSetupV2());
  secondAddress = await secondAccount.getAddress();
  bondingMinAddress = await bondingMinAccount.getAddress();
  bondingMaxAddress = await bondingMaxAccount.getAddress();
});

describe("bondingV2 migration", () => {
  describe("migrate", () => {
    it("migrate should work", async () => {
      await expect(bondingV2.connect(bondingMaxAccount).migrate()).to.not.be
        .reverted;
    });

    it("migrate should fail second time", async () => {
      await expect(bondingV2.connect(bondingMaxAccount).migrate()).to.not.be
        .reverted;

      await expect(
        bondingV2.connect(bondingMaxAccount).migrate()
      ).to.be.revertedWith("not v1 address");
    });

    it("migrate should fail if msg.sender is not a user to migrate", async () => {
      // second account not v1 => migrate should revert
      await expect(bondingV2.connect(admin).migrate()).to.be.revertedWith(
        "not v1 address"
      );
    });

    it("migrate should fail if not in migration", async () => {
      await bondingV2.connect(admin).setMigrating(false);
      await expect(
        bondingV2.connect(bondingMinAccount).migrate()
      ).to.be.revertedWith("not in migration");

      await bondingV2.connect(admin).setMigrating(true);
      await expect(bondingV2.connect(bondingMinAccount).migrate()).to.not.be
        .reverted;
    });

    it("migrate should fail if user LP amount to migrate is 0", async () => {
      await expect(
        bondingV2.connect(bondingZeroAccount).migrate()
      ).to.be.revertedWith("LP amount is zero");
    });

    it("migrate should raise event", async () => {
      await expect(bondingV2.connect(bondingMinAccount).migrate()).to.emit(
        bondingV2,
        "Migrated"
      );
    });
  });

  describe("addUserToMigrate", () => {
    it("addUserToMigrate should work if migrator", async () => {
      await expect(
        bondingV2.connect(admin).addUserToMigrate(secondAddress, 1, 1)
      ).to.not.be.reverted;
    });

    it("addUserToMigrate should fail if not migrator", async () => {
      await expect(
        bondingV2
          .connect(bondingMaxAccount)
          .addUserToMigrate(secondAddress, 1, 1)
      ).to.be.revertedWith("not migrator");
    });

    it("addUserToMigrate should permit user to migrate", async () => {
      await expect(
        bondingV2.connect(admin).addUserToMigrate(secondAddress, 1, 1)
      ).to.not.be.reverted;

      await expect(bondingV2.connect(secondAccount).migrate()).to.not.be
        .reverted;
    });

    it("addUserToMigrate should give id to user", async () => {
      await bondingV2.connect(admin).addUserToMigrate(secondAddress, 1, 1);

      expect(await bondingV2.toMigrateId(secondAddress)).to.be.gt(1);
    });
  });

  describe("migrating", () => {
    it("migrating should be true if  in migration", async () => {
      expect(await bondingV2.migrating()).to.be.true;
    });

    it("migrating should be false if not in migration", async () => {
      await bondingV2.connect(admin).setMigrating(false);
      expect(await bondingV2.migrating()).to.be.false;
    });
  });

  describe("toMigrateId", () => {
    it("toMigrateId should be not null if not migrated", async () => {
      expect(await bondingV2.toMigrateId(bondingMaxAddress)).to.be.gt(1);
    });

    it("toMigrateId should give back ", async () => {
      expect(await bondingV2.toMigrateId(secondAddress)).to.be.equal(0);
    });

    it("toMigrateId should be null if migrated", async () => {
      await (await bondingV2.connect(bondingMaxAccount).migrate()).wait();
      expect(await bondingV2.toMigrateId(bondingMaxAddress)).to.be.equal(0);
    });

    it("toMigrateId should be null if not v1 address", async () => {
      expect(await bondingV2.toMigrateId(secondAddress)).to.be.equal(0);
    });
  });

  describe("setMigrator", () => {
    it("setMigrator should work", async () => {
      // admin is migrator at init => setMigrator to second account
      await bondingV2.connect(admin).setMigrator(secondAddress);

      // now second account is migrator => addUserToMigrate should not revert
      await expect(
        bondingV2.connect(secondAccount).addUserToMigrate(secondAddress, 1, 1)
      ).to.not.be.reverted;
    });

    it("setMigrator should work if migrator", async () => {
      // admin is migrator at init => setMigrator should not revert
      await expect(bondingV2.connect(admin).setMigrator(secondAddress)).to.not
        .be.reverted;
    });

    it("setMigrator should fail if not migrator", async () => {
      // second account not migrator => setMigrator should revert
      await expect(
        bondingV2.connect(secondAccount).setMigrator(secondAddress)
      ).to.be.revertedWith("not migrator");
    });
  });

  describe("bonding share V2", () => {
    const getBondV2 = async (
      _user: Signer,
      _lp = 1,
      _weeks = 208
    ): Promise<Bond> => {
      const address = await _user.getAddress();

      await bondingV2.connect(admin).addUserToMigrate(address, _lp, _weeks);
      await (await bondingV2.connect(_user).migrate()).wait();

      const id = (await bondingShareV2.holderTokens(address))[0];
      const bond = await bondingShareV2.getBond(id);

      return bond;
    };

    it("bonding share V2 should be minted with incremental ID", async () => {
      await (await bondingV2.connect(bondingMinAccount).migrate()).wait();
      await (await bondingV2.connect(bondingMaxAccount).migrate()).wait();

      const idsMin = await bondingShareV2.holderTokens(bondingMinAddress);
      const idsMax = await bondingShareV2.holderTokens(bondingMaxAddress);
      expect(idsMax[0].sub(idsMin[0])).to.be.equal(1);
      expect(idsMax[0]).to.be.equal(1);
    });

    it("bonding share V2 with Zero LP should not increment ID", async () => {
      await expect(bondingV2.connect(bondingZeroAccount).migrate()).to.be
        .reverted;
      await (await bondingV2.connect(bondingMaxAccount).migrate()).wait();

      expect(
        (await bondingShareV2.holderTokens(bondingMaxAddress))[0]
      ).to.be.equal(0);
    });

    it("bonding share V2 should have endblock according to weeks param", async () => {
      const blockCountInAWeek: BigNumber = BigNumber.from(20000);
      await bondingV2.setBlockCountInAWeek(blockCountInAWeek);

      const bond = await getBondV2(secondAccount, 42, 208);

      expect(bond.endBlock).to.be.equal(
        bond.creationBlock.add(blockCountInAWeek.mul(208))
      );
    });

    it("bonding share V2 should have LP amount according to LP param", async () => {
      const bond = await getBondV2(secondAccount, 2, 208);

      expect(bond.lpAmount).to.be.equal(2);
    });

    it("bonding share V2 should have appropriate minter", async () => {
      const bond = await getBondV2(secondAccount, 2, 208);

      expect(bond.minter).to.be.equal(secondAddress);
    });

    // TODO : check lpRewardDebt and shares are correct
    // it("bonding share V2 should have lpRewardDebt amount according to lpRewardDebt param", async () => {});
    // it("bonding share V2 should have shares amount according to shares param", async () => {});
  });
});
