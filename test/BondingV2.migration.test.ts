import { expect } from "chai";
import { Signer } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { bondingSetupV2 } from "./BondingSetupV2";

describe("bondingV2 migration", () => {
  let bondingV2: BondingV2;
  let secondAccount: Signer;
  let bondingZeroAccount: Signer;
  let bondingMinAccount: Signer;
  let bondingMaxAccount: Signer;
  let secondAddress: string;
  let admin: Signer;

  beforeEach(async () => {
    ({
      admin,
      secondAccount,
      bondingV2,
      bondingZeroAccount,
      bondingMaxAccount,
      bondingMinAccount
    } = await bondingSetupV2());
    secondAddress = await secondAccount.getAddress();
  });

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

  it("migrate should fail user LP amount to migrate is 0", async () => {
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

  it("addUserToMigrate should work only if migrator", async () => {
    await expect(
      bondingV2.connect(bondingMaxAccount).addUserToMigrate(secondAddress, 1, 1)
    ).to.be.revertedWith("not migrator");

    await expect(bondingV2.connect(admin).addUserToMigrate(secondAddress, 1, 1))
      .to.not.be.reverted;
  });

  it("migrate should work after addUserToMigrate", async () => {
    await expect(bondingV2.connect(admin).addUserToMigrate(secondAddress, 1, 1))
      .to.not.be.reverted;

    await expect(bondingV2.connect(secondAccount).migrate()).to.not.be.reverted;
  });

  it("setMigrator should work", async () => {
    // admin is migrator at init => setMigrator to second account
    await bondingV2.connect(admin).setMigrator(secondAddress);

    // now second account is migrator => addUserToMigrate should not revert
    await expect(
      bondingV2.connect(secondAccount).addUserToMigrate(secondAddress, 1, 1)
    ).to.not.be.reverted;
  });

  it("onlyMigrator can call setMigrator  ", async () => {
    // second account not migrator => setMigrator should revert
    await expect(
      bondingV2.connect(secondAccount).setMigrator(secondAddress)
    ).to.be.revertedWith("not migrator");

    // admin is migrator at init => setMigrator should not revert
    await expect(bondingV2.connect(admin).setMigrator(secondAddress)).to.not.be
      .reverted;
  });

  // it("migrate should work", async () => {
  // check that a bonding share V2 is minted with an incremental ID
  // check that  bonding share V2 attributes for
  // endblock weeks minter LP amount lpRewardDebt and shares are correct
  // });
});
