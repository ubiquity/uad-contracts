import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShare } from "../artifacts/types/BondingShare";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetupV2, deposit } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";

describe("bondingV2 migration", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18

  let uAD: UbiquityAlgorithmicDollar;
  let bondingV2: BondingV2;
  let bondingShare: BondingShare;
  let blockCountInAWeek: BigNumber;
  let secondAccount: Signer;
  let secondAddress: string;
  let admin: Signer;

  beforeEach(async () => {
    ({ admin, secondAccount, uAD, bondingV2, bondingShare, blockCountInAWeek } =
      await bondingSetupV2());
    secondAddress = await secondAccount.getAddress();
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

  it("onlyMigrator can call addUserToMigrate", async () => {
    // second account not migrator => addUserToMigrate should revert
    await expect(
      bondingV2.connect(secondAccount).addUserToMigrate(secondAddress, 1, 1)
    ).to.to.be.revertedWith("not migrator");

    // admin is migrator at init => setMigrator to second account
    await bondingV2.connect(admin).setMigrator(secondAddress);

    // now second account is migrator => addUSerMigrate should not revert
    await expect(
      bondingV2.connect(secondAccount).addUserToMigrate(secondAddress, 1, 1)
    ).to.not.be.reverted;
  });

  // it("migrate should fail if msg.sender is not a user to migrate", async () => {});
  // it("migrate should fail user migration is done", async () => {});
  // it("migrate should fail user LP amount to migrate is 0", async () => {});
  // it("migrate should work", async () => {
  // check that a bonding share V2 is minted with an incremental ID
  // check that  bonding share V2 attributes for
  // endblock weeks minter LP amount lpRewardDebt and shares are correct
  // check that user migrated is set to migrated and LP amount is 0 in _v1Holders
  // check that migrated event is raised
  // });
});
