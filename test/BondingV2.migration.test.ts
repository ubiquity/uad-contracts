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
  let bondingZeroAddress: string;
  let bondingMinAddress: string;
  let bondingMaxAddress: string;
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
    bondingZeroAddress = await bondingZeroAccount.getAddress();
    bondingMinAddress = await bondingMinAccount.getAddress();
    bondingMaxAddress = await bondingMaxAccount.getAddress();
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

  it("setMigrator should work", async () => {
    // admin is migrator at init => setMigrator to second account
    await bondingV2.connect(admin).setMigrator(secondAddress);

    // now second account is migrator => setMigrator should not revert
    await expect(bondingV2.connect(secondAccount).setMigrator(secondAddress)).to
      .not.be.reverted;
  });

  it("onlyOwnerOrMigrator can call migrate", async () => {
    await bondingV2.connect(admin).setMigrating(true);

    // second account not migrator or owner => migrate should revert
    await expect(
      bondingV2.connect(secondAccount).migrate(bondingMinAddress)
    ).to.be.revertedWith("only owner or migrator can migrate");

    // admin is migrator at init, migrator can call migrate => should not revert
    await expect(bondingV2.connect(admin).migrate(bondingMaxAddress)).to.not.be
      .reverted;

    // owner can call migrate => should not revert
    await expect(
      bondingV2.connect(bondingMinAccount).migrate(bondingMinAddress)
    ).to.not.be.reverted;
  });

  it("migrate should fail if msg.sender is not a user to migrate", async () => {
    await bondingV2.connect(admin).setMigrating(true);

    // second account not v1 => migrate should revert
    await expect(
      bondingV2.connect(admin).migrate(secondAddress)
    ).to.be.revertedWith("not v1 address");
  });

  it("migrate should fail before and after migration", async () => {
    // before migration => should revert
    await expect(
      bondingV2.connect(admin).migrate(bondingMaxAddress)
    ).to.be.revertedWith("not in migration");

    await bondingV2.connect(admin).setMigrating(true);
    await expect(bondingV2.connect(admin).migrate(bondingMinAddress)).to.not.be
      .reverted;

    // after migration => should revert
    await bondingV2.connect(admin).setMigrating(false);
    await expect(
      bondingV2.connect(admin).migrate(bondingMaxAddress)
    ).to.be.revertedWith("not in migration");
  });
  it("migrate should fail user LP amount to migrate is 0", async () => {
    await bondingV2.connect(admin).setMigrating(true);

    await expect(
      bondingV2.connect(admin).migrate(bondingZeroAddress)
    ).to.be.revertedWith("LP amount is zero");
  });
  // it("migrate should work", async () => {
  // check that a bonding share V2 is minted with an incremental ID
  // check that  bonding share V2 attributes for
  // endblock weeks minter LP amount lpRewardDebt and shares are correct
  // check that user migrated is set to migrated and LP amount is 0 in _v1Holders
  // check that migrated event is raised
  // });
});
