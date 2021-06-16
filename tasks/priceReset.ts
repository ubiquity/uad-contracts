import { task, types } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ERC20 } from "../artifacts/types/ERC20";
import pressAnyKey from "../utils/flow";

task("priceReset", "PriceReset can push uAD price lower or higher")
  .addParam("amount", "The amount of uAD-3CRV LP token to be withdrawn")
  .addOptionalParam(
    "pushhigher",
    "if false will withdraw 3CRV to push uAD price lower",
    true,
    types.boolean
  )
  .setAction(
    async (
      taskArgs: { amount: string; pushhigher: boolean },
      { ethers, getNamedAccounts }
    ) => {
      const net = await ethers.provider.getNetwork();
      const accounts = await ethers.getSigners();
      const adminAdr = await accounts[0].getAddress();
      const amount = ethers.utils.parseEther(taskArgs.amount);
      console.log(`---account addr:${adminAdr}  `);
      let curve3CrvToken = "";
      ({ curve3CrvToken } = await getNamedAccounts());
      if (net.name === "hardhat") {
        console.warn("You are running the   task with Hardhat network");
      }
      console.log(`net chainId: ${net.chainId}  `);
      const manager = (await ethers.getContractAt(
        "UbiquityAlgorithmicDollarManager",
        "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98"
      )) as UbiquityAlgorithmicDollarManager;
      const uADAdr = await manager.dollarTokenAddress();
      const uAD = (await ethers.getContractAt(
        "UbiquityAlgorithmicDollar",
        uADAdr
      )) as UbiquityAlgorithmicDollar;
      const curveToken = (await ethers.getContractAt(
        "ERC20",
        curve3CrvToken
      )) as ERC20;
      const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
      console.log(`---metaPoolAddr:${metaPoolAddr}  `);
      const metaPool = (await ethers.getContractAt(
        "IMetaPool",
        metaPoolAddr
      )) as IMetaPool;
      const uadBalanceBefore = await uAD.balanceOf(adminAdr);
      const crvBalanceBefore = await curveToken.balanceOf(adminAdr);
      const metapoolLPBalanceBefore = await metaPool.balanceOf(adminAdr);
      const LPBal = ethers.utils.formatEther(metapoolLPBalanceBefore);
      const expectedUAD = await metaPool[
        "calc_withdraw_one_coin(uint256,int128)"
      ](amount, 0);

      const expectedUADStr = ethers.utils.formatEther(expectedUAD);
      const expectedCRV = await metaPool[
        "calc_withdraw_one_coin(uint256,int128)"
      ](amount, 1);

      const expectedCRVStr = ethers.utils.formatEther(expectedCRV);

      if (taskArgs.pushhigher) {
        console.warn(`we will remove :${taskArgs.amount} uAD-3CRV LP token from your ${LPBal} uAD3CRV balance
                      for an expected ${expectedUADStr} uAD unilateraly
                      This will have the immediate effect of
                      pushing the uAD price HIGHER`);
      } else {
        console.warn(`we will remove :${taskArgs.amount} uAD-3CRV LP token from your ${LPBal} uAD3CRV balance
                      for an expected ${expectedCRVStr} 3CRV unilateraly
                      This will have the immediate effect of
                      pushing the uAD price LOWER`);
      }
      await pressAnyKey(
        "Press any key if you are sure you want to continue ..."
      );

      const tx = await metaPool[
        "remove_liquidity_one_coin(uint256,int128,uint256)"
      ](amount, 0, 0);
      console.log(`removed liquidity waiting for confirmation`);
      const receipt = tx.wait(1);
      console.log(
        `tx ${(await receipt).status === 0 ? "FAIL" : "SUCCESS"}
        hash:${tx.hash}

        `
      );
      const uadBalanceAfter = await uAD.balanceOf(adminAdr);
      const crvBalanceAfter = await curveToken.balanceOf(adminAdr);
      const metapoolLPBalanceAfter = await metaPool.balanceOf(adminAdr);
      const LPBalAfter = ethers.utils.formatEther(metapoolLPBalanceAfter);
      console.log(`from ${LPBal} to ${LPBalAfter} uAD-3CRV LP token
      `);
      if (taskArgs.pushhigher) {
        const balUadBeforeStr = ethers.utils.formatEther(uadBalanceBefore);
        const balUadAfterStr = ethers.utils.formatEther(uadBalanceAfter);
        console.log(`from ${balUadBeforeStr} to ${balUadAfterStr} uAD
        `);
      } else {
        const crvBalanceBeforeStr = ethers.utils.formatEther(crvBalanceBefore);
        const crvBalanceAfterStr = ethers.utils.formatEther(crvBalanceAfter);
        console.log(`from ${crvBalanceBeforeStr} to ${crvBalanceAfterStr} 3CRV
        `);
      }
    }
  );
