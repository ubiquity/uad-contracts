import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { ERC20 } from "./types/ERC20";
import { ICurveFactory } from "./types/ICurveFactory";
import { UbiquityAlgorithmicDollar } from "./types/UbiquityAlgorithmicDollar";
import { UbiquityAlgorithmicDollarManager } from "./types/UbiquityAlgorithmicDollarManager";
import { CurveUADIncentive } from "./types/CurveUADIncentive";
import { IMetaPool } from "../artifacts/types/IMetaPool";
// This file is only here to make interacting with the Dapp easier,
// feel free to ignore it if you don't need it.

task("metapool", "Sends ETH and tokens to an address").setAction(
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
    console.log(` metaPoolAddr:${metaPoolAddr}  `);
    const metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;
    const curveFactory = "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE";
    const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const curvePoolFactory = (await ethers.getContractAt(
      "ICurveFactory",
      curveFactory
    )) as ICurveFactory;

    const pool0UADbal = await metaPool.balances(0);
    const pool1CRVbal = await metaPool.balances(1);

    console.log(`
    pool0UADbal:${ethers.utils.formatEther(pool0UADbal)}
    pool1CRVbal:${ethers.utils.formatEther(pool1CRVbal)}
      `);

    const underBalances = await curvePoolFactory.get_underlying_balances(
      metaPool.address
    );

    console.log(`
    underBalances
    0:${ethers.utils.formatEther(underBalances[0])}
    1:${ethers.utils.formatEther(underBalances[1])}
    2:${ethers.utils.formatEther(underBalances[2])}
    3:${ethers.utils.formatEther(underBalances[3])}
        `);
    const indices = await curvePoolFactory.get_coin_indices(
      metaPool.address,
      DAI,
      USDT
    );
    console.log(`
    DAI indices:${indices[0]}
    USDT indices:${indices[1]}  `);

    const indices2 = await curvePoolFactory.get_coin_indices(
      metaPool.address,
      uAD.address,
      USDC
    );
    console.log(`
    uAD indices:${indices2[0]}
    USDC indices:${indices2[1]}  `);
    const dyDAI2USDT = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](indices[0], indices[1], ethers.utils.parseEther("1"));
    console.log(`
          DAI2USDT:${ethers.utils.formatEther(dyDAI2USDT)}
            `);

    const dyuAD2USDC = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](indices2[0], indices2[1], ethers.utils.parseEther("1"));
    console.log(`
    uAD2USDC:${ethers.utils.formatEther(dyuAD2USDC)}
      `);
    const dyuAD2DAI = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](indices2[0], indices[0], ethers.utils.parseEther("1"));
    console.log(`
      uAD2DAI:${ethers.utils.formatEther(dyuAD2DAI)}
        `);

    const dyuAD2USDT = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](indices2[0], indices[1], ethers.utils.parseEther("1"));
    console.log(`
          uAD2USDT:${ethers.utils.formatEther(dyuAD2USDT)}
            `);
    const rates = await curvePoolFactory.get_rates(metaPool.address);
    console.log(`
    rates
    0:${ethers.utils.formatEther(rates[0])}
    1:${ethers.utils.formatEther(rates[1])}
      `);
  }
);
