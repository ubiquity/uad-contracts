import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { ERC20 } from "./types/ERC20";
import { UbiquityAlgorithmicDollar } from "./types/UbiquityAlgorithmicDollar";
import { UbiquityAlgorithmicDollarManager } from "./types/UbiquityAlgorithmicDollarManager";
import { CurveUADIncentive } from "./types/CurveUADIncentive";
// This file is only here to make interacting with the Dapp easier,
// feel free to ignore it if you don't need it.

task("incentive", "Sends ETH and tokens to an address").setAction(
  async (
    taskArgs: { receiver: string; manager: string },
    { ethers, getNamedAccounts }
  ) => {
    const net = await ethers.provider.getNetwork();

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
    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    const incentive = await uAD.incentiveContract(metaPoolAddr);
    const curveIncentive = (await ethers.getContractAt(
      "CurveUADIncentive",
      incentive
    )) as CurveUADIncentive;

    console.log("curveIncentive   at:", incentive);

    const isSellPenaltyOn = await curveIncentive.isSellPenaltyOn();
    const isBuyIncentiveOn = await curveIncentive.isBuyIncentiveOn();
    console.log(`
    isSellPenaltyOn:${isSellPenaltyOn}
    isBuyIncentiveOn:${isBuyIncentiveOn}
      `);
  }
);
