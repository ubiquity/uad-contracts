import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetupV2, deposit } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";

describe("bondingV2 migration", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18

  let uAD: UbiquityAlgorithmicDollar;
  let bonding: Bonding;
  let bondingShare: BondingShare;
  let secondAccount: Signer;
  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({ secondAccount, uAD, bonding, bondingShare, blockCountInAWeek } =
      await bondingSetupV2());
  });
  it("onlyMigrator can call setMigrator  ", async () => {});
  it("setMigrator should work", async () => {});
  it("onlyMigrator can call addUserToMigrate and removeUserToMigrate", async () => {});
  it("migrate should fail if msg.sender is not a user to migrate", async () => {});
  it("migrate should fail user migration is done", async () => {});
  it("migrate should fail user LP amount to migrate is 0", async () => {});
  it("migrate should work", async () => {
    // check that a bonding share V2 is minted with an incremental ID
    // check that  bonding share V2 attributes for
    // endblock weeks minter LP amount lpRewardDebt and shares are correct
    // check that user migrated is set to migrated and LP amount is 0 in _v1Holders
    // check that migrated event is raised
  });
});