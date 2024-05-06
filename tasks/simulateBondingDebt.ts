/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";

import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingDebt } from "../artifacts/types/BondingDebt";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const lastBlock = 19810615;

const toClaim = [
  "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d",
  "0x4007ce2083c7f3e18097aeb3a39bb8ec149a341d",
  "0x7c76f4db70b7e2177de10de3e2f668dadcd11108",
  "0xa53a6fe2d8ad977ad926c485343ba39f32d3a3f6",
  "0xcefd0e73cc48b0b9d4c8683e52b7d7396600abb2",
];

task("simulateBondingDebt", "bonding debt contract deployment and claim")
  .addOptionalParam("address", "The address to simulate bonding ")
  .setAction(async (taskArgs: { address: string }, { ethers, network }) => {
    const { address: paramAddress } = taskArgs;

    const UBQ_MINTER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
    );

    const UbiquityAlgorithmicDollarManagerAddress =
      "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
    let manager: UbiquityAlgorithmicDollarManager;

    const adminAddress = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";
    let admin: Signer;

    const BondingShareV2Address = "0x2dA07859613C14F6f05c97eFE37B9B4F212b5eF5";
    let bondingShareV2: BondingShareV2;

    let masterChefV2: MasterChefV2;

    let bondingDebt: BondingDebt;

    const BondingV2Address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";
    let bondingV2: BondingV2;

    const mineBlock = async (timestamp: number): Promise<void> => {
      await network.provider.request({
        method: "evm_mine",
        params: [timestamp],
      });
    };

    const mineNBlock = async (
      blockCount: number,
      secondsBetweenBlock?: number
    ): Promise<void> => {
      const blockBefore = await ethers.provider.getBlock("latest");
      const maxMinedBlockPerBatch = 5000;
      let blockToMine = blockCount;
      let blockTime = blockBefore.timestamp;
      while (blockToMine > maxMinedBlockPerBatch) {
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        const minings = [...Array(maxMinedBlockPerBatch).keys()].map(
          (_v, i) => {
            const newTs = blockTime + i + (secondsBetweenBlock || 1);
            return mineBlock(newTs);
          }
        );
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(minings);
        blockToMine -= maxMinedBlockPerBatch;
        blockTime =
          blockTime +
          maxMinedBlockPerBatch -
          1 +
          maxMinedBlockPerBatch * (secondsBetweenBlock || 1);
      }
      const minings = [...Array(blockToMine).keys()].map((_v, i) => {
        const newTs = blockTime + i + (secondsBetweenBlock || 1);
        return mineBlock(newTs);
      });
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(minings);
    };

    // deploy BondingDebt contract
    const bondingDebtDeploy: BondingDebt = (await (
      await ethers.getContractFactory("BondingDebt")
    ).deploy()) as BondingDebt;

    const resetFork = async (blockNumber: number): Promise<void> => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${
                process.env.ALCHEMY_API_KEY || ""
              }`,
              blockNumber,
            },
          },
        ],
      });
    };

    const newMasterChefV2 = async (): Promise<MasterChefV2> => {
      const newChefV2: MasterChefV2 = (await ethers.getContractAt(
        "MasterChefV2",
        "0xdae807071b5AC7B6a2a343beaD19929426dBC998"
      )) as MasterChefV2;

      await manager.connect(admin).setMasterChefAddress(newChefV2.address);
      await manager
        .connect(admin)
        .grantRole(UBQ_MINTER_ROLE, newChefV2.address);

      return newChefV2;
    };

    const init = async (block: number): Promise<void> => {
      await resetFork(block);
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [adminAddress],
      });

      admin = ethers.provider.getSigner(adminAddress);

      manager = (await ethers.getContractAt(
        "UbiquityAlgorithmicDollarManager",
        UbiquityAlgorithmicDollarManagerAddress
      )) as UbiquityAlgorithmicDollarManager;

      bondingShareV2 = (await ethers.getContractAt(
        "BondingShareV2",
        BondingShareV2Address
      )) as BondingShareV2;

      masterChefV2 = await newMasterChefV2();

      bondingV2 = (await ethers.getContractAt(
        "BondingV2",
        BondingV2Address
      )) as BondingV2;

      bondingDebt = bondingDebtDeploy;
    };

    const query = async (
      bondId: number,
      log = false
    ): Promise<
      [
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        BigNumber,
        number
      ]
    > => {
      const block = await ethers.provider.getBlockNumber();
      const uGOVmultiplier = await masterChefV2.uGOVmultiplier();
      const totalShares = await masterChefV2.totalShares();
      const [lastRewardBlock, accuGOVPerShare] = await masterChefV2.pool();
      const totalSupply = await bondingShareV2.totalSupply();
      const totalLP = await bondingShareV2.totalLP();

      const pendingUGOV = await masterChefV2.pendingUGOV(bondId);
      const [amount, rewardDebt] = await masterChefV2.getBondingShareInfo(
        bondId
      );
      const bond = await bondingShareV2.getBond(bondId);

      if (log) {
        console.log(`BLOCK:${block}`);
        console.log("uGOVmultiplier", ethers.utils.formatEther(uGOVmultiplier));
        console.log("totalShares", ethers.utils.formatEther(totalShares));
        console.log("lastRewardBlock", lastRewardBlock.toString());
        console.log(
          "accuGOVPerShare",
          ethers.utils.formatUnits(accuGOVPerShare.toString(), 12)
        );
        console.log("totalSupply", totalSupply.toString());
        console.log("totalLP", totalLP.toString());

        if (bondId) {
          console.log(`BOND:${bondId}`);
          console.log("pendingUGOV", ethers.utils.formatEther(pendingUGOV));
          console.log("amount", ethers.utils.formatEther(amount));
          console.log("rewardDebt", ethers.utils.formatEther(rewardDebt));
          console.log("bond", bond.toString());
        }
      }
      return [
        totalShares,
        accuGOVPerShare,
        pendingUGOV,
        amount,
        rewardDebt,
        totalSupply,
        totalLP,
        uGOVmultiplier,
        lastRewardBlock,
        block,
      ];
    };

    const claimBondingDebt = async (_address: string) => {
      console.log(`\n>> Address ${_address}`);

      const whaleAdress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [_address],
      });
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whaleAdress],
      });
      const whale = ethers.provider.getSigner(whaleAdress);
      const account = ethers.provider.getSigner(_address);
      await whale.sendTransaction({
        to: _address,
        value: BigNumber.from(10).pow(18).mul(10),
      });
    };

    await init(lastBlock);
    if (paramAddress) {
      await claimBondingDebt(paramAddress);
    } else {
      for (let i = 0; i < toClaim.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await claimBondingDebt(toClaim[i]);
      }
    }
  });
