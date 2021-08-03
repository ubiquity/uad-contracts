import { expect } from "chai";
import { ethers } from "hardhat";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { resetFork } from "./utils/hardhatNode";

const MasterChefV2Address = "0xb8ec70d24306ecef9d4aaf9986dcb1da5736a997";
let masterChefV2: MasterChefV2;

describe("pendingUGOV", () => {
  beforeEach(async () => {
    await resetFork(12931490);

    masterChefV2 = (await ethers.getContractAt(
      "MasterChefV2",
      MasterChefV2Address
    )) as MasterChefV2;
  });

  it("Should get pendingUGOV Bond 1 null at creation", async () => {
    const block = 12931491;
    await resetFork(block);

    const totalShares = await masterChefV2.totalShares();
    console.log(`totalShares ${totalShares}`);

    const [lastRewardBlock, accuGOVPerShare] = await masterChefV2.pool();
    console.log(
      `pool ${block} ${lastRewardBlock} ${ethers.utils.formatEther(
        accuGOVPerShare
      )}`
    );

    const pendingUGOV = await masterChefV2.pendingUGOV(1);
    console.log(
      `pendingUGOV 1 ${block} ${ethers.utils.formatEther(pendingUGOV)}`
    );

    const [amount, rewardDebt] = await masterChefV2.getBondingShareInfo(1);
    console.log(
      `getBondingShareInfo 1 ${block} ${ethers.utils.formatEther(
        amount
      )} ${ethers.utils.formatEther(rewardDebt)}`
    );

    expect(pendingUGOV).to.be.equal(0);
    expect(amount).to.be.equal(0);
    expect(rewardDebt).to.be.equal(0);
  });

  it("Should get pendingUGOV Bond 1 modified after first migration", async () => {
    const block = 12932142;
    await resetFork(block);
    const totalShares = await masterChefV2.totalShares();
    console.log(`totalShares ${totalShares}`);

    const [lastRewardBlock, accuGOVPerShare] = await masterChefV2.pool();
    console.log(
      `pool ${block} ${lastRewardBlock} ${ethers.utils.formatEther(
        accuGOVPerShare
      )}`
    );

    console.log(
      `pendingUGOV 1 ${block}`,
      ethers.utils.formatEther(await masterChefV2.pendingUGOV(1))
    );

    const [amount, rewardDebt] = await masterChefV2.getBondingShareInfo(1);
    console.log(
      `getBondingShareInfo 1 ${block} ${ethers.utils.formatEther(
        amount
      )} ${ethers.utils.formatEther(rewardDebt)}`
    );

    expect(2).to.be.gt(1);
  });
});
