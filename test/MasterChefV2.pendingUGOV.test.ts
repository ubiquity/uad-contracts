import { expect } from "chai";
import { ethers } from "hardhat";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { resetFork } from "./utils/hardhatNode";

const MasterChefV2Address = "0xb8ec70d24306ecef9d4aaf9986dcb1da5736a997";
let masterChefV2: MasterChefV2;

describe("pendingUGOV", () => {
  beforeEach(async () => {
    await resetFork(12942183);

    masterChefV2 = (await ethers.getContractAt(
      "MasterChefV2",
      MasterChefV2Address
    )) as MasterChefV2;
  });

  it("Should get pendingUGOV Bond1", async () => {
    const pendingUGOV = await masterChefV2.pendingUGOV(1);
    console.log("pendingUGOV1", ethers.utils.formatEther(pendingUGOV));
    expect(pendingUGOV).to.be.gt(1);
  });

  it("Should get pendingUGOV Bond2", async () => {
    const pendingUGOV = await masterChefV2.pendingUGOV(2);
    console.log("pendingUGOV2", ethers.utils.formatEther(pendingUGOV));
    expect(pendingUGOV).to.be.gt(1);
  });
});
