import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, network } from "hardhat";
import { resetFork, mineNBlock } from "./utils/hardhatNode";

import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const UBQ_MINTER_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
);
const zero = BigNumber.from(0);
const ten = BigNumber.from(10);

const firstOneAddress = "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d";
let firstOne: Signer;
const firstOneBondId = 1;
const newOneAddress = "0xd6efc21d8c941aa06f90075de1588ac7e912fec6";
let newOne: Signer;

const UbiquityAlgorithmicDollarManagerAddress =
  "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
let manager: UbiquityAlgorithmicDollarManager;

const adminAddress = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";
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

const lastBlock = 12967000;

const newMasterChefV2 = async (): Promise<MasterChefV2> => {
  // deploy a NEW MasterChefV2 to debug
  const newChefV2: MasterChefV2 = (await (
    await ethers.getContractFactory("MasterChefV2")
  ).deploy(UbiquityAlgorithmicDollarManagerAddress)) as MasterChefV2;
  await manager.connect(admin).setMasterChefAddress(newChefV2.address);
  await manager.connect(admin).grantRole(UBQ_MINTER_ROLE, newChefV2.address);

  return newChefV2;
};

const init = async (block: number, newChef = false): Promise<void> => {
  await resetFork(block);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [adminAddress],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [firstOneAddress],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [newOneAddress],
  });
  admin = ethers.provider.getSigner(adminAddress);
  firstOne = ethers.provider.getSigner(firstOneAddress);
  newOne = ethers.provider.getSigner(newOneAddress);

  manager = (await ethers.getContractAt(
    "UbiquityAlgorithmicDollarManager",
    UbiquityAlgorithmicDollarManagerAddress
  )) as UbiquityAlgorithmicDollarManager;

  bondingShareV2 = (await ethers.getContractAt(
    "BondingShareV2",
    BondingShareV2Address
  )) as BondingShareV2;

  if (newChef) {
    masterChefV2 = await newMasterChefV2();
  } else {
    masterChefV2 = (await ethers.getContractAt(
      "MasterChefV2",
      MasterChefV2Address
    )) as MasterChefV2;
  }
  bondingV2 = (await ethers.getContractAt(
    "BondingV2",
    BondingV2Address
  )) as BondingV2;
};

const query = async (
  bondId = 1,
  log = false
): Promise<
  [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber]
> => {
  const block = await ethers.provider.getBlockNumber();
  const uGOVPerBlock = await masterChefV2.uGOVPerBlock();
  const totalShares = await masterChefV2.totalShares();
  const [lastRewardBlock, accuGOVPerShare] = await masterChefV2.pool();
  const totalSupply = await bondingShareV2.totalSupply();

  const pendingUGOV = await masterChefV2.pendingUGOV(bondId);
  const [amount, rewardDebt] = await masterChefV2.getBondingShareInfo(bondId);
  const bond = await bondingShareV2.getBond(bondId);

  if (log) {
    console.log(`BLOCK:${block}`);
    console.log("uGOVPerBlock", ethers.utils.formatEther(uGOVPerBlock));
    console.log("totalShares", ethers.utils.formatEther(totalShares));
    console.log("lastRewardBlock", lastRewardBlock.toString());
    console.log(
      "accuGOVPerShare",
      ethers.utils.formatUnits(accuGOVPerShare.toString(), 12)
    );
    console.log("totalSupply", totalSupply.toString());

    console.log(`BOND:${bondId}`);
    console.log("pendingUGOV", ethers.utils.formatEther(pendingUGOV));
    console.log("amount", ethers.utils.formatEther(amount));
    console.log("rewardDebt", ethers.utils.formatEther(rewardDebt));
    console.log("bond", bond.toString());
  }
  return [
    totalShares,
    accuGOVPerShare,
    pendingUGOV,
    amount,
    rewardDebt,
    totalSupply,
  ];
};

describe("Should get pendingUGOV", () => {
  after(async () => {
    await resetFork(12592661);
  });

  describe("PROD MasterChefV2", () => {
    it("NULL just before first migration", async () => {
      await init(firstMigrateBlock - 1);
      expect(await query(firstOneBondId)).to.be.eql([
        zero,
        zero,
        zero,
        zero,
        zero,
        zero,
      ]);
    });

    it("TOO BIG after first migration", async () => {
      await init(firstMigrateBlock);
      const [
        totalShares,
        accuGOVPerShare,
        pendingUGOV,
        amount,
        rewardDebt,
        totalSupply,
      ] = await query(firstOneBondId);

      // NORMAL
      expect(pendingUGOV).to.be.equal(0);
      expect(totalSupply).to.be.equal(1);
      expect(totalShares).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(amount).to.be.gt(ten.pow(18)).lt(ten.pow(24));

      // TOO BIG
      expect(accuGOVPerShare).to.be.gt(ten.pow(30));
      expect(rewardDebt).to.be.gt(ten.pow(30));
    });
  });

  describe("NEW MasterChefV2", () => {
    it("OK before first transaction", async () => {
      await init(firstMigrateBlock - 1, true);

      expect(await query(firstOneBondId)).to.be.eql([
        zero,
        zero,
        zero,
        zero,
        zero,
        zero,
      ]);

      await (await bondingV2.connect(firstOne).migrate()).wait();

      // mine some blocks to get pendingUGOV
      await mineNBlock(10);

      const [
        totalShares,
        accuGOVPerShare,
        pendingUGOV,
        amount,
        rewardDebt,
        totalSupply,
      ] = await query(firstOneBondId);

      expect(pendingUGOV).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(totalSupply).to.be.equal(1);
      expect(totalShares).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(amount).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(accuGOVPerShare).to.be.equal(0);
      expect(rewardDebt).to.be.equal(0);
    });

    it("OK after first 4 migrations", async () => {
      await init(lastBlock, true);

      masterChefV2 = await newMasterChefV2();

      await bondingV2.connect(admin).setMigrating(true);
      await (await bondingV2.connect(newOne).migrate()).wait();

      const id = (
        await bondingShareV2.holderTokens(newOneAddress)
      )[0].toNumber();

      // mine some blocks to get pendingUGOV
      await mineNBlock(10);

      const [
        totalShares,
        accuGOVPerShare,
        pendingUGOV,
        amount,
        rewardDebt,
        totalSupply,
      ] = await query(id);

      expect(pendingUGOV).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(totalSupply).to.be.equal(6);
      expect(totalShares).to.be.gt(ten.pow(18)).lt(ten.pow(24));
      expect(amount).to.be.gt(ten.pow(16)).lt(ten.pow(24));
      expect(accuGOVPerShare).to.be.equal(0);
      expect(rewardDebt).to.be.equal(0);
    });
  });
});
