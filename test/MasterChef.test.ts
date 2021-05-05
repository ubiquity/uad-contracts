import { ethers } from "hardhat";
import { describe, it } from "mocha";
import { BigNumber, constants, Signer } from "ethers";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { bondingSetup } from "./BondingSetup";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { MasterChef } from "../artifacts/types/MasterChef";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { mineNBlock } from "./utils/hardhatNode";
import { swap3CRVtoUAD } from "./utils/swap";
import { ERC20 } from "../artifacts/types/ERC20";
import { calculateUGOVMultiplier, isAmountEquivalent } from "./utils/calc";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";

describe("MasterChef", () => {
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  let masterChef: MasterChef;

  let manager: UbiquityAlgorithmicDollarManager;
  let secondAccount: Signer;
  let curveWhale: Signer;
  let admin: Signer;
  let secondAddress: string;
  let metaPool: IMetaPool;
  let twapOracle: TWAPOracle;
  let uAD: UbiquityAlgorithmicDollar;
  let crvToken: ERC20;
  let uGOV: UbiquityGovernance;
  let uGOVRewardForHundredBlock: BigNumber;
  let bonding: Bonding;
  let bondingShare: BondingShare;

  before(async () => {
    ({
      manager,
      admin,
      masterChef,
      bonding,
      bondingShare,
      uGOV,
      curveWhale,
      crvToken,
      secondAccount,
      metaPool,
      twapOracle,
      uAD,
    } = await bondingSetup());
    secondAddress = await secondAccount.getAddress();
    // for testing purposes set the week equal to one block
    await bonding.setBlockCountInAWeek(1);
  });

  describe("TwapPrice", () => {
    it("TwapPrice should be 1", async () => {
      const twapPrice = await twapOracle.consult(uAD.address);
      expect(twapPrice).to.be.equal(one);
    });
  });

  describe("updateUGOVMultiplier", () => {
    it("Should update UGOVMultiplier, and get multiplied by 1.05 at price 1", async () => {
      const m0 = await masterChef.uGOVmultiplier();
      expect(m0).to.equal(ethers.utils.parseEther("1")); // m0 = m1 * 1.05
      console.log("before");
      // push uAD price down
      await swap3CRVtoUAD(
        metaPool,
        crvToken,
        ethers.utils.parseEther("1000"),
        curveWhale
      );
      await twapOracle.update();
      await swap3CRVtoUAD(metaPool, crvToken, BigNumber.from(1), curveWhale);
      await twapOracle.update();

      const twapPrice = await twapOracle.consult(uAD.address);
      expect(twapPrice).to.be.gt(one);
      //  multiplier * ( 1.05 / (1 + abs( 1 - price ) ) )
      const calcMultiplier = calculateUGOVMultiplier(
        m0.toString(),
        twapPrice.toString()
      );

      // need to do a deposit to trigger the uGOV Multiplier calculation
      console.log("iiiiiiiiiiii");
      await metaPool.connect(secondAccount).approve(bonding.address, one);
      await bonding.connect(secondAccount).deposit(one, 1);
      console.log("00000000000");
      const m1 = await masterChef.uGOVmultiplier();

      expect(m1).to.equal(calcMultiplier);
      // assert that if the price doesn't change neither is the multiplier
      const user = await masterChef
        .connect(secondAccount)
        .userInfo(secondAddress);
      const tokenIds = await bondingShare.connect(secondAccount).holderTokens();
      console.log(
        "*--*-*-*-*-* tokkk",
        tokenIds.length,
        tokenIds[0].toString()
      );
      await bonding.connect(secondAccount).withdraw(user.amount, tokenIds[0]);

      const m2 = await masterChef.uGOVmultiplier();
      expect(m1).to.equal(m2); // m2 = m1 * 1.05
    });
  });

  describe("deposit", () => {
    it("Should be able to deposit", async () => {
      const amount = one.mul(100);
      await metaPool.connect(secondAccount).approve(bonding.address, amount);
      await expect(bonding.connect(secondAccount).deposit(amount, 1))
        .to.emit(metaPool, "Transfer")
        .withArgs(secondAddress, masterChef.address, amount);

      const user = await masterChef
        .connect(secondAccount)
        .userInfo(secondAddress);
      expect(user.amount).to.equal(amount);
      // do not have pending rewards just after depositing
      const pendingUGOV = await masterChef.pendingUGOV(secondAddress);
      expect(pendingUGOV).to.equal(0);

      const pool = await masterChef.pool();
      expect(user.rewardDebt).to.equal(
        user.amount.mul(pool.accuGOVPerShare).div(BigNumber.from(10).pow(12))
      );
    });

    it("Should calculate pendingUGOV after 100 blocks", async () => {
      await mineNBlock(100);
      console.log("aftermine");
      const pendingUGOV = await masterChef.pendingUGOV(secondAddress);
      const uGOVmultiplier = await masterChef.uGOVmultiplier();
      const uGOVPerBlock = await masterChef.uGOVPerBlock();
      const lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const pool = await masterChef.pool();
      const fromBlock = pool.lastRewardBlock;
      const numberOfBlock = lastBlock.number - fromBlock.toNumber();
      expect(numberOfBlock).to.equal(100);

      // uGOVReward = (( (_to - _from) * uGOVmultiplier ) * uGOVPerBlock) / 1e18
      uGOVRewardForHundredBlock = BigNumber.from(numberOfBlock)
        .mul(uGOVmultiplier)
        .mul(uGOVPerBlock)
        .div(one);
      console.log("uGOVmultiplier", uGOVmultiplier.toString());

      console.log(
        `---uGOVRewardForHundredBlock:${ethers.utils.formatEther(
          uGOVRewardForHundredBlock
        )}`
      );
      const totalLPSupply = await metaPool.balanceOf(masterChef.address);
      // (uGOVReward * 1e12) / lpSupply)
      const accuGOVPerShare = uGOVRewardForHundredBlock
        .mul(BigNumber.from(10).pow(12))
        .div(totalLPSupply);

      const user = await masterChef
        .connect(secondAccount)
        .userInfo(secondAddress);
      // (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
      console.log(" user.rewardDebt", user.rewardDebt.toString());
      console.log("accuGOVPerShare", accuGOVPerShare.toString());
      console.log(
        "FIRST TEST SC SAYS THAT WE ARE GETTING pendingUGOV:",
        ethers.utils.formatEther(pendingUGOV)
      );

      const pendingCalculated = user.amount
        .mul(accuGOVPerShare)
        .div(BigNumber.from(10).pow(12));
      console.log(
        "FIRST TEST WE CALULATED pendingUGOV:",
        ethers.utils.formatEther(pendingCalculated)
      );
      const uGovBalanceSec = await uGOV.balanceOf(secondAddress);
      console.log(
        "FIRST TEST  uGovBalance of second adr",
        ethers.utils.formatEther(uGovBalanceSec)
      );
      const uGovBalanceMster = await uGOV.balanceOf(masterChef.address);
      console.log(
        "FIRST TEST  uGovBalance of masterchef",
        ethers.utils.formatEther(uGovBalanceMster)
      );
      expect(pendingUGOV).to.equal(pendingCalculated);
    });
  });

  describe("withdraw", () => {
    it("Should be able to withdraw", async () => {
      // get reward
      const lastBlockB = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const poolB = await masterChef.pool();
      const fromBlockB = poolB.lastRewardBlock;
      const numberOfBlockB = lastBlockB.number - fromBlockB.toNumber();
      const auGOVmultiplier = await masterChef.uGOVmultiplier();
      const uGOVPerBlockB = await masterChef.uGOVPerBlock();
      const calculatedUGOVRewardToBeMinted = BigNumber.from(numberOfBlockB + 1)
        .mul(auGOVmultiplier)
        .mul(uGOVPerBlockB)
        .div(one);

      console.log(
        `
        numberOfBlockB:${numberOfBlockB}
        auGOVmultiplier:${ethers.utils.formatEther(auGOVmultiplier)}

        uGOVRewardToBeMinted :${ethers.utils.formatEther(
          calculatedUGOVRewardToBeMinted
        )}`
      );
      const uGovBalanceBefore = await uGOV.balanceOf(secondAddress);

      console.log("auGOVmultiplier", auGOVmultiplier.toString());
      console.log(
        "secondAddress uGovBalanceBefore",
        ethers.utils.formatEther(uGovBalanceBefore)
      );
      const uGovBalanceMster = await uGOV.balanceOf(masterChef.address);
      console.log(
        "masterchef uGovBalance of ",
        ethers.utils.formatEther(uGovBalanceMster)
      );

      await expect(masterChef.connect(secondAccount).getRewards())
        .to.emit(uGOV, "Transfer")
        .withArgs(
          ethers.constants.AddressZero,
          masterChef.address,
          calculatedUGOVRewardToBeMinted
        ); //minting uGOV

      const buGOVmultiplier = await masterChef.uGOVmultiplier();

      const uGovBalanceAfter = await uGOV.balanceOf(secondAddress);
      console.log(
        `
        buGOVmultiplier:${ethers.utils.formatEther(buGOVmultiplier)}
        uGovBalanceBefore:${ethers.utils.formatEther(uGovBalanceBefore)}

        uGOVRewardToBeMinted :${ethers.utils.formatEther(
          calculatedUGOVRewardToBeMinted
        )}`
      );
      // as there is only one LP provider he gets pretty much all the rewards
      const isPrecise = isAmountEquivalent(
        uGovBalanceAfter.toString(),
        uGovBalanceBefore.add(calculatedUGOVRewardToBeMinted).toString(),
        "0.000000000001"
      );
      expect(isPrecise).to.be.true;

      // do not have pending rewards anymore just after withdrawing rewards
      const pendingUGOV = await masterChef.pendingUGOV(secondAddress);
      expect(pendingUGOV).to.equal(0);

      // push the price further so that the reward should be less than previously
      // push uAD price down
      const twapPrice1 = await twapOracle.consult(uAD.address);
      await swap3CRVtoUAD(
        metaPool,
        crvToken,
        ethers.utils.parseEther("10000"),
        curveWhale
      );
      await twapOracle.update();
      const twapPrice2 = await twapOracle.consult(uAD.address);
      await swap3CRVtoUAD(metaPool, crvToken, BigNumber.from(1), curveWhale);
      await twapOracle.update();
      const twapPrice3 = await twapOracle.consult(uAD.address);
      console.log(
        `
        twapPrice1:${ethers.utils.formatEther(twapPrice1)}
        twapPrice2:${ethers.utils.formatEther(twapPrice2)}
        twapPrice3 :${ethers.utils.formatEther(twapPrice3)}`
      );
      expect(twapPrice3).to.be.gt(one);
      // should withdraw rewards to trigger the uGOVmultiplier
      await masterChef.connect(secondAccount).getRewards();
      await mineNBlock(100);

      const uGOVmultiplier = await masterChef.uGOVmultiplier();
      const uGOVPerBlock = await masterChef.uGOVPerBlock();
      const lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const pool = await masterChef.pool();
      const fromBlock = pool.lastRewardBlock;
      const numberOfBlock = lastBlock.number - fromBlock.toNumber();
      expect(numberOfBlock).to.equal(100);

      // uGOVReward = (( (_to - _from) * uGOVmultiplier ) * uGOVPerBlock) / 1e18
      const NewuGOVRewardForHundredBlock = BigNumber.from(numberOfBlock)
        .mul(uGOVmultiplier)
        .mul(uGOVPerBlock)
        .div(one);

      expect(NewuGOVRewardForHundredBlock).to.be.lt(
        uGOVRewardForHundredBlock.div(BigNumber.from(2))
      );
      console.log(
        `---NewuGOVRewardForHundredBlock:${ethers.utils.formatEther(
          NewuGOVRewardForHundredBlock
        )}`
      );

      // calculating uGOV Rewards
      const totalLPSupply = await metaPool.balanceOf(masterChef.address);
      const user = await masterChef
        .connect(secondAccount)
        .userInfo(secondAddress);
      const pendingCalculated = BigNumber.from(101)
        .mul(uGOVmultiplier)
        .mul(uGOVPerBlock)
        .div(one)
        .mul(user.amount)
        .div(totalLPSupply);

      console.log(
        `*pendingCalculated:${ethers.utils.formatEther(pendingCalculated)}`
      );
      // there is a loss of precision
      const lostPrecision = pendingCalculated.mod(BigNumber.from(1e8));
      console.log(
        `*x:${ethers.utils.formatEther(pendingCalculated.sub(lostPrecision))}
        pendingCalculated-x

        `
      );
      // when withdrawing we also get our UGOV Rewards
      const tokenIds = await bondingShare.connect(secondAccount).holderTokens();
      console.log(
        "*--*-*-*-*-* tokkk",
        tokenIds.length,
        tokenIds[0].toString()
      );
      await expect(
        bonding.connect(secondAccount).withdraw(one.mul(100), tokenIds[0])
      )
        .to.emit(uGOV, "Transfer")
        .withArgs(
          masterChef.address,
          secondAddress,
          pendingCalculated.sub(lostPrecision)
        );
    });

    it("Should retrieve pendingUGOV", async () => {
      expect(await masterChef.pendingUGOV(secondAddress)).to.be.equal(0);
    });
    //TODO CANT DEPOSIT WITHDRAW DIRECTLY
  });
});
