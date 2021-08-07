import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, deployments } from "hardhat";
import { resetFork, mineNBlock, impersonate, send } from "./utils/hardhatNode";

import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { IERC20Ubiquity } from "../artifacts/types/IERC20Ubiquity";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const firstMigrateBlock = 12932141;
const lastBlock = 12967000;

// const UBQ_MINTER_ROLE = ethers.utils.keccak256(
//   ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
// );
const zero = BigNumber.from(0);
const ten = BigNumber.from(10);

const firstOneAddress = "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d";
// let firstOne: Signer;
const firstOneBondId = 1;
const newOneAddress = "0xd6efc21d8c941aa06f90075de1588ac7e912fec6";
let newOne: Signer;

const managerAddress = "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
let manager: UbiquityAlgorithmicDollarManager;

const adminAddress = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";
let admin: Signer;

// const BondingShareV2BlockCreation = 12931486;
const BondingShareV2Address = "0x2dA07859613C14F6f05c97eFE37B9B4F212b5eF5";
let bondingShareV2: BondingShareV2;

// const MasterChefV2BlockCreation = 12931490;
let MasterChefV2Address = "0xb8ec70d24306ecef9d4aaf9986dcb1da5736a997";
let masterChefV2: MasterChefV2;

// const BondingV2BlockCreation = 12931495;
const BondingV2Address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";
let bondingV2: BondingV2;

const UbqAddress = "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0";
let UBQ: IERC20Ubiquity;

// const newMasterChefV2 = async (): Promise<MasterChefV2> => {
//   return await deployments.fixture(["MasterChefV2.1"]);
// };

const init = async (block: number, newChef = false): Promise<void> => {
  await resetFork(block);

  await impersonate(adminAddress);
  await impersonate(firstOneAddress);
  await impersonate(newOneAddress);

  admin = ethers.provider.getSigner(adminAddress);
  // firstOne = ethers.provider.getSigner(firstOneAddress);
  newOne = ethers.provider.getSigner(newOneAddress);

  // manager = (await ethers.getContractAt(
  //   "UbiquityAlgorithmicDollarManager",
  //   UbiquityAlgorithmicDollarManagerAddress
  // )) as UbiquityAlgorithmicDollarManager;

  UBQ = (await ethers.getContractAt(
    "UbiquityGovernance",
    UbqAddress
  )) as IERC20Ubiquity;

  bondingShareV2 = (await ethers.getContractAt(
    "BondingShareV2",
    BondingShareV2Address
  )) as BondingShareV2;

  if (newChef) {
    await deployments.fixture(["MasterChefV2.1"]);
    MasterChefV2Address = (await deployments.get("MasterChefV2")).address;
  }

  masterChefV2 = (await ethers.getContractAt(
    "MasterChefV2",
    MasterChefV2Address
  )) as MasterChefV2;

  if (newChef) {
    await send(adminAddress, 100);
    const mgrFactory = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    const UBQ_MINTER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
    );
    manager = mgrFactory.attach(
      managerAddress
    ) as UbiquityAlgorithmicDollarManager;
    expect(manager.address).to.be.equal(managerAddress);

    await manager.connect(admin).setMasterChefAddress(masterChefV2.address);
    await manager
      .connect(admin)
      .grantRole(UBQ_MINTER_ROLE, masterChefV2.address);
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

describe("MasterChefV2 pendingUGOV", () => {
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

  describe("NEW MasterChefV2.1", () => {
    it("OK after first 5 migrations", async () => {
      await init(lastBlock, true);

      expect(await query(firstOneBondId)).to.be.eql([
        BigNumber.from("130176002929905530325461"),
        zero,
        BigNumber.from("30776804668000"),
        BigNumber.from("1301000000000000000"),
        zero,
        BigNumber.from(5),
      ]);

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
      expect(accuGOVPerShare).to.gt(ten.pow(7));
      expect(rewardDebt).to.gt(ten.pow(16)).lt(ten.pow(24));
    });

    it("Bond2 should get back UBQ", async () => {
      await init(lastBlock, true);

      const user2 = "0x4007ce2083c7f3e18097aeb3a39bb8ec149a341d";
      await send(user2, 100);
      await impersonate(user2);
      const bond2Signer = ethers.provider.getSigner(user2);

      await mineNBlock(1000);

      const pendingUGOV1 = await masterChefV2.pendingUGOV(2);
      const bond1 = await bondingShareV2.getBond(2);
      const ubq1 = await UBQ.balanceOf(user2);

      // console.log("pendingUGOV", ethers.utils.formatEther(pendingUGOV1));
      // console.log("lpAmount", ethers.utils.formatEther(bond1[5]));
      // console.log("UBQ", ethers.utils.formatEther(ubq1));

      expect(pendingUGOV1).to.be.equal("590636270975891737806"); // 590.xxx
      expect(bond1[5]).to.be.equal("74603879373206500005186"); // 74603.xxx
      expect(ubq1).to.be.equal("168394820774964495022850"); // 168394.xxx
      expect(bond1[0].toLowerCase()).to.be.equal(user2.toLowerCase());

      await masterChefV2.connect(bond2Signer).getRewards(2);
      const pendingUGOV2 = await masterChefV2.pendingUGOV(2);
      const ubq2 = await UBQ.balanceOf(user2);

      // console.log("pendingUGOV", ethers.utils.formatEther(pendingUGOV2));
      // console.log("UBQ", ethers.utils.formatEther(ubq2));

      expect(pendingUGOV2).to.be.equal(0);
      expect(ubq1.add(pendingUGOV1).sub(ubq2)).to.be.lt(ten.pow(18));
    });
  });
});