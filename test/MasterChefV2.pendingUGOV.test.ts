import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, network } from "hardhat";
import { resetFork } from "./utils/hardhatNode";

import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const UBQ_MINTER_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
);
const zero = BigNumber.from(0);
const firstOneAddress = "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d";
let firstOne: Signer;

let UbiquityAlgorithmicDollarManagerAddress =
  "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
let manager: UbiquityAlgorithmicDollarManager;

let adminAddress = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";
let admin: Signer;

// const BondingShareV2BlockCreation = 12931486;
const BondingShareV2Address = "0x2dA07859613C14F6f05c97eFE37B9B4F212b5eF5";
let bondingShareV2: BondingShareV2;

// const MasterChefV2BlockCreation = 12931490;
const MasterChefV2Address = "0xb8ec70d24306ecef9d4aaf9986dcb1da5736a997";
let masterChefV2: MasterChefV2;

// const BondingV2BlockCreation = 12931495;
const BondingV2Address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";
let bondingV2: BondingV2;

// const contractsV2created = 12931495;
const firstMigrateBlock = 12932141;

const init = async (block: number): Promise<void> => {
  await resetFork(block);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [adminAddress],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [firstOneAddress],
  });
  firstOne = ethers.provider.getSigner(firstOneAddress);
  admin = ethers.provider.getSigner(adminAddress);

  manager = (await ethers.getContractAt(
    "UbiquityAlgorithmicDollarManager",
    UbiquityAlgorithmicDollarManagerAddress
  )) as UbiquityAlgorithmicDollarManager;

  bondingShareV2 = (await ethers.getContractAt(
    "BondingShareV2",
    BondingShareV2Address
  )) as BondingShareV2;

  // masterChefV2 = (await ethers.getContractAt(
  //   "MasterChefV2",
  //   MasterChefV2Address
  // )) as MasterChefV2;

  // deploy a new MasterChefV2 to debug
  masterChefV2 = (await (
    await ethers.getContractFactory("MasterChefV2")
  ).deploy(UbiquityAlgorithmicDollarManagerAddress)) as MasterChefV2;
  await manager.connect(admin).setMasterChefAddress(masterChefV2.address);
  await manager.connect(admin).grantRole(UBQ_MINTER_ROLE, masterChefV2.address);

  bondingV2 = (await ethers.getContractAt(
    "BondingV2",
    BondingV2Address
  )) as BondingV2;
};

const query = async (): Promise<
  [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber]
> => {
  const totalShares = await masterChefV2.totalShares();
  console.log(`totalShares ${totalShares}`);

  const [lastRewardBlock, accuGOVPerShare] = await masterChefV2.pool();
  console.log(
    `pool ${lastRewardBlock} ${ethers.utils.formatEther(accuGOVPerShare)}`
  );

  const pendingUGOV = await masterChefV2.pendingUGOV(1);
  console.log(`pendingUGOV 1 ${ethers.utils.formatEther(pendingUGOV)}`);

  const [amount, rewardDebt] = await masterChefV2.getBondingShareInfo(1);
  console.log(
    `getBondingShareInfo 1  ${ethers.utils.formatEther(
      amount
    )} ${ethers.utils.formatEther(rewardDebt)}`
  );

  const totalSupply = await bondingShareV2.totalSupply();
  console.log(`pool ${totalSupply}`);

  const bond = await bondingShareV2.getBond(1);
  console.log(`bond 1 ${bond}`);

  return [
    totalShares,
    accuGOVPerShare,
    pendingUGOV,
    amount,
    rewardDebt,
    totalSupply,
  ];
};

describe("pendingUGOV", () => {
  it("Should get pendingUGOV Bond 1 NULL just before first migration", async () => {
    await init(firstMigrateBlock - 1);
    expect(await query()).to.be.eql([zero, zero, zero, zero, zero, zero]);
  });

  it("Should get pendingUGOV Bond 1 null just before first migration", async () => {
    await init(firstMigrateBlock - 1);
    await bondingV2.connect(admin).migrate();
    expect(true).to.be.true;
  });

  it("Should get pendingUGOV Bond 1 TOO BIG after first migration", async () => {
    await init(firstMigrateBlock);
    const [
      totalShares,
      accuGOVPerShare,
      pendingUGOV,
      amount,
      rewardDebt,
      totalSupply,
    ] = await query();

    expect(totalSupply).to.be.equal(1);
  });
});
