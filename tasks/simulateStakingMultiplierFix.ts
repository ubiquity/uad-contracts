/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import fs from "fs";

import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const lastBlock = 19810615;

// First six bond holders
const bondHolders = [
  "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d",
  "0x4007ce2083c7f3e18097aeb3a39bb8ec149a341d",
  "0x7c76f4db70b7e2177de10de3e2f668dadcd11108",
  "0x0000ce08fa224696a819877070bf378e8b131acf",
  "0xa53a6fe2d8ad977ad926c485343ba39f32d3a3f6",
  "0xcefd0e73cc48b0b9d4c8683e52b7d7396600abb2",
];

// Bond ids to be fixed
const ids = [1, 2, 3, 4, 5, 6];

// uAD3CRV-f amounts locked, in wei
const lpTokenLockedAmounts = [
  "1301000000000000000",
  "74603879373206500005186",
  "44739174270101943975392",
  "1480607760433248019987",
  "9351040526163838324896",
  "8991650309086743220575",
];

// locked weeks
const lpTokenLockedweeks = [176, 208, 208, 2, 208, 208];

// shares to compensate (expected values, to be compared with on-chain data)
const sharesToCompensate = [
  "3037709911985672143",
  "223798109540617080091011",
  "134209409861506101262213",
  "4187791150719107540",
  "28051425871893200037985",
  "26973320392057628638757",
];

task("simulateStakingMultiplierFix", "simulate migration of one address")
  .addOptionalParam("addressFix", "The bond holder address")
  .addOptionalParam("idFix", "The bond id")
  .setAction(
    async (
      taskArgs: { addressFix: string; idFix: number },
      { ethers, network }
    ) => {
      const { addressFix: paramAddress, idFix: paramId } = taskArgs;

      const UBQ_MINTER_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
      );

      const UbiquityAlgorithmicDollarManagerAddress =
        "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
      let manager: UbiquityAlgorithmicDollarManager;

      const adminAddress = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";
      let admin: Signer;

      const BondingShareV2Address =
        "0x2dA07859613C14F6f05c97eFE37B9B4F212b5eF5";
      let bondingShareV2: BondingShareV2;
      let masterChefV2: MasterChefV2;

      const BondingV2Address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";
      let bondingV2: BondingV2;

      const UbiquityFormulasAddress =
        "0x54F528979A50FA8Fe99E0118EbbEE5fC8Ea802F7";
      let ubiquityFormulas: UbiquityFormulas;

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
        const maxMinedBlockPerBatch = 500000;
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
        await manager.connect(admin).grantRole(UBQ_MINTER_ROLE, adminAddress);

        return newChefV2;
      };

      const init = async (block: number): Promise<void> => {
        await resetFork(block);
        await network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [adminAddress],
        });

        // set up admin, manager, bondingShare and masterChef
        admin = ethers.provider.getSigner(adminAddress);

        manager = (await ethers.getContractAt(
          "UbiquityAlgorithmicDollarManager",
          UbiquityAlgorithmicDollarManagerAddress
        )) as UbiquityAlgorithmicDollarManager;

        ubiquityFormulas = (await ethers.getContractAt(
          "UbiquityFormulas",
          UbiquityFormulasAddress
        )) as UbiquityFormulas;

        bondingShareV2 = (await ethers.getContractAt(
          "BondingShareV2",
          BondingShareV2Address
        )) as BondingShareV2;

        masterChefV2 = await newMasterChefV2();

        bondingV2 = (await ethers.getContractAt(
          "BondingV2",
          BondingV2Address
        )) as BondingV2;
      };

      const allResults: {
        address: string;
        bondId: number;
        currentNumberOfShares: string;
        currentLpRewardDebt: string;
        lastRewardBlock: string;
        block: number;
        bondExpirationBlock: number;
        numberOfSharesToCompensate: string;
      }[] = [];

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
          number,
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
        const bondExpirationBlock = bond[4];

        if (log) {
          if (bondId) {
            console.log(`BOND:${bondId}`);
            console.log(`BLOCK:${block}`);
            console.log("Bond details", bond.toString());
            console.log("uAD3CRV-f staked", ethers.utils.formatEther(bond[1]));
            console.log(
              "BondingShare info",
              amount.toString(),
              rewardDebt.toString()
            );

            // verify that bond contains the same amount of LP tokens staked as shares reported by BondingShareInfo
            expect(bond[1], "stake already removed").to.be.equal(amount);
            // check expected staked value
            expect(bond[1]).to.be.equal(lpTokenLockedAmounts[bondId - 1]);
          }
          console.log(
            "uGOVmultiplier",
            uGOVmultiplier.toString(),
            ethers.utils.formatEther(uGOVmultiplier)
          );
          console.log("lastRewardBlock", lastRewardBlock.toString());
          console.log(
            "accuGOVPerShare",
            ethers.utils.formatUnits(accuGOVPerShare.toString(), 12)
          );
          console.log("Total number of bonds created", totalSupply.toString());
          console.log(
            "total LP staked",
            ethers.utils.formatEther(totalLP.toString())
          );
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
          bondExpirationBlock.toNumber(),
        ];
      };

      const applyMultiplier = async (_address: string, bondId: number) => {
        console.log(
          `\n>> Address ${_address} is the bond holder of bond ${bondId}`
        );

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

        const bondHolder = ethers.provider.getSigner(_address);

        await whale.sendTransaction({
          to: _address,
          value: BigNumber.from(10).pow(18).mul(10),
        });

        try {
          const res = await query(bondId, true);

          // if (true) return;
          const currentNumberOfShares = res[3];
          const currentLpRewardDebt = res[4];
          const lastRewardBlock = res[8].toString();
          const block = res[9];
          const bondExpirationBlock = res[10];

          console.log(
            `== Block ${block} Last Reward Block ${lastRewardBlock} Bond expiration block ${bondExpirationBlock}`
          );
          // updating bond

          const correctNumberOfShares: BigNumber =
            await ubiquityFormulas.durationMultiply(
              BigNumber.from(lpTokenLockedAmounts[bondId - 1]),
              BigNumber.from(lpTokenLockedweeks[bondId - 1]),
              BigNumber.from("1000000000000000")
            );

          const numberOfSharesToCompensate = correctNumberOfShares.sub(
            currentNumberOfShares
          );

          console.log(
            "Current number of shares deposited in MasterChefV21 for this bond:",
            currentNumberOfShares.toString()
          );
          console.log(
            "Number of shares that should have been deposited:",
            correctNumberOfShares.toString()
          );
          console.log(
            "Number of shares to compensate:",
            numberOfSharesToCompensate.toString()
          );

          console.log(
            "Current LP reward debt",
            currentLpRewardDebt.toString(),
            ethers.utils.formatEther(currentLpRewardDebt)
          );

          // compensate the lpReward based on numberOfSharesToCompensate
          const correctMultiplier: BigNumber =
            await ubiquityFormulas.durationMultiply(
              BigNumber.from("1000000000000000000"),
              BigNumber.from(lpTokenLockedweeks[bondId - 1]),
              BigNumber.from("1000000000000000")
            );

          console.log(
            "Correct multiplier",
            correctMultiplier.toString(),
            ethers.utils.formatEther(correctMultiplier)
          );

          // admin corrects the bond by updating lpRewards to compensate
          // all other parameters of the bond must remain untouched
          const lpRewardToCompensate = currentLpRewardDebt
            .mul(correctMultiplier)
            .div("1000000000000000000")
            .sub(currentLpRewardDebt);

          console.log(
            "LP reward to compensate",
            lpRewardToCompensate.toString(),
            ethers.utils.formatEther(lpRewardToCompensate)
          );

          // Create a JSON object with the results for this iteration
          const resultJSON = {
            address: _address,
            bondId,
            currentNumberOfShares: currentNumberOfShares.toString(),
            currentLpRewardDebt: currentLpRewardDebt.toString(),
            lastRewardBlock,
            block,
            bondExpirationBlock,
            numberOfSharesToCompensate: numberOfSharesToCompensate.toString(),
          };

          // Push the result JSON object to the allResults array
          allResults.push(resultJSON);

          /*
          await bondingShareV2
            .connect(admin)
            .updateBond(
              bondId,
              res[3],
              lpRewardToCompensate,
              bondExpirationBlock
            );
          */

          // updated bond details
          const bond = await bondingShareV2.getBond(bondId);
          console.log("Updated bond details", bond.toString());

          // get rewards
          // await masterChefV2.connect(bondHolder).getRewards(bondId);
        } catch (e) {
          console.log(`** ERROR ${(e as Error).message}`);
        }
      };

      await init(lastBlock);

      // for (let j = lastBlock + 1; j < lastBlock + 5000000; j += 10000) {
      if (paramAddress && paramId) {
        // eslint-disable-next-line no-await-in-loop
        await applyMultiplier(paramAddress, paramId);
      } else {
        for (let i = 0; i < bondHolders.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await applyMultiplier(bondHolders[i], ids[i]);
        }
      }
      // eslint-disable-next-line no-await-in-loop
      //  await resetFork(j);
      // }

      console.log(JSON.stringify(allResults));

      // Write allResults JSON data to a file
      fs.writeFileSync("allResults.json", JSON.stringify(allResults));
    }
  );
