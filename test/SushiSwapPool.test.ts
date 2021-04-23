import { Signer, BigNumber, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SushiSwapPool } from "../artifacts/types/SushiSwapPool";
import { IUniswapV2Factory } from "../artifacts/types/IUniswapV2Factory";
import { IUniswapV2Pair } from "../artifacts/types/IUniswapV2Pair";
import { IUniswapV2Router02 } from "../artifacts/types/IUniswapV2Router02";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";

// UNISWAP
// const tokenA = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// const tokenB = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
// const factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
// const firstPair = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
// const reserveA = "144065947714472";
// const reserveB = "75512578800914566328215";
// const nbPairs = 31941;

/*
      SUSHISWAP Glossary
    SushiSwap is a Uniswap v2 fork with the execption of the setFeeTo()
    that was called in the deployment setting 0.05% of the fee to the SushiMaker
    * SushiMaker will receive LP tokens from people trading on SushiSwap.
      Burn the LP tokens for the provided token pair and swap tokens for sushi
      finally send the sushi to the bar
    * SushiBar cpeople can enter with SUSHI, receive xSUSHI and later leave
      with even more SUSHI.
    * SushiRoll contract a migrator is provided, so people can easily move liquidity
      from Uniswap to SushiSwap.
    * SushiRoll contract a migrator is provided, so people can easily move liquidity
      from Uniswap to SushiSwap.
    * MasterChef enables the minting of new SUSHI token. It's the only way to create SUSHI
      This is possible by staking LP tokens inside the MasterChef. The higher the
      allocation points of a liquidity pool, the more SUSHI one receives for staking its LP tokens.
*/

const tokenA = "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2"; // sushi token
const tokenB = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT
const factoryAdr = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"; // SushiV2Factory mainnet
const routerAdr = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"; // SushiV2Router02
const masterChefAdr = "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd"; // MasterChef
const sushiMakerAdr = "0xE11fc0B43ab98Eb91e9836129d1ee7c3Bc95df50"; // SushiMaker
const firstPair = "0x680A025Da7b1be2c204D7745e809919bCE074026"; // SushiSwap SUSHI/USDT LP (SLP)
const reserveA = "1201055109316335905137";
const reserveB = "17860836355";
const nbPairs = 901;

describe("SushiSwapPool", () => {
  let admin: Signer;
  let secondAccount: Signer;
  let manager: UbiquityAlgorithmicDollarManager;
  let sushi: SushiSwapPool;
  let sushiFactory: ContractFactory;
  let router: IUniswapV2Router02;
  let factory: IUniswapV2Factory;
  let sushiUSDTPair: IUniswapV2Pair;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;

  beforeEach(async () => {
    [admin, secondAccount] = await ethers.getSigners();
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;
    router = (await ethers.getContractAt(
      "IUniswapV2Router02",
      routerAdr
    )) as IUniswapV2Router02;
    factory = (await ethers.getContractAt(
      "IUniswapV2Factory",
      factoryAdr
    )) as IUniswapV2Factory;
    sushiUSDTPair = (await ethers.getContractAt(
      "IUniswapV2Pair",
      firstPair
    )) as IUniswapV2Pair;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setuADTokenAddress(uAD.address);

    const UGOV = await ethers.getContractFactory("UbiquityGovernance");
    uGOV = (await UGOV.deploy(manager.address)) as UbiquityGovernance;
    await manager.setuGOVTokenAddress(uGOV.address);
    sushiFactory = await ethers.getContractFactory("SushiSwapPool");
    sushi = (await sushiFactory.deploy(manager.address)) as SushiSwapPool;

    const mintings = [await secondAccount.getAddress()].map(
      async (signer): Promise<void> => {
        await uAD.mint(signer, ethers.utils.parseEther("10000"));
        await uGOV.mint(signer, ethers.utils.parseEther("1000"));
      }
    );
    await Promise.all(mintings);
  });

  describe("SushiSwap Factory", () => {
    it(`should get ${nbPairs} pairs`, async () => {
      const allPairsLength: BigNumber = await factory.allPairsLength();

      expect(allPairsLength).to.be.equal(nbPairs);
    });
    it("should get first pair 0xB4e...", async () => {
      const pair = await factory.allPairs(0);

      expect(pair).to.be.equal(firstPair);
    });
  });

  describe("SushiSwap first Pair", () => {
    it("should get factory address from first pair", async () => {
      const pairFactoryAddress = await sushiUSDTPair.factory();
      expect(pairFactoryAddress).to.be.equal(factory.address);
    });
    it("should get tokens, reserves of first pair", async () => {
      const token0 = await sushiUSDTPair.token0();
      const token1 = await sushiUSDTPair.token1();
      const [reserve0, reserve1] = await sushiUSDTPair.getReserves();

      expect(token0).to.be.equal(tokenA);
      expect(token1).to.be.equal(tokenB);
      expect(reserve0).to.be.equal(reserveA);
      expect(reserve1).to.be.equal(reserveB);
    });
  });

  describe("SushiSwap", () => {
    it("should create pool", async () => {
      const pool = await sushi.pair();

      const poolContract: IUniswapV2Pair = (await ethers.getContractAt(
        "IUniswapV2Pair",
        pool
      )) as IUniswapV2Pair;

      const token0 = await poolContract.token0();
      const token1 = await poolContract.token1();
      const [reserve0, reserve1] = await poolContract.getReserves();

      if (token0 === uAD.address) {
        expect(token0).to.be.equal(uAD.address);
        expect(token1).to.be.equal(uGOV.address);
      } else {
        expect(token0).to.be.equal(uGOV.address);
        expect(token1).to.be.equal(uAD.address);
      }
      expect(reserve0).to.be.equal("0");
      expect(reserve1).to.be.equal("0");
    });

    it("should provide liquidity to pool", async () => {
      const pair = await sushi.pair();
      const poolContract: IUniswapV2Pair = (await ethers.getContractAt(
        "IUniswapV2Pair",
        pair
      )) as IUniswapV2Pair;

      let [reserve0, reserve1] = await poolContract.getReserves();
      expect(reserve0).to.equal(0);
      expect(reserve1).to.equal(0);

      // If the liquidity is to be added to an ERC-20/ERC-20 pair, use addLiquidity.
      const blockBefore = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      // must allow to transfer token
      await uAD
        .connect(secondAccount)
        .approve(routerAdr, ethers.utils.parseEther("10000"));
      await uGOV
        .connect(secondAccount)
        .approve(routerAdr, ethers.utils.parseEther("1000"));
      const totSupplyBefore = await poolContract.totalSupply();

      await expect(
        router
          .connect(secondAccount)
          .addLiquidity(
            uAD.address,
            uGOV.address,
            ethers.utils.parseEther("10000"),
            ethers.utils.parseEther("1000"),
            ethers.utils.parseEther("9900"),
            ethers.utils.parseEther("990"),
            await secondAccount.getAddress(),
            blockBefore.timestamp + 100
          )
      )
        .to.emit(poolContract, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          1000
        );

      [reserve0, reserve1] = await poolContract.getReserves();
      expect(reserve1).to.equal(ethers.utils.parseEther("10000"));
      expect(reserve0).to.equal(ethers.utils.parseEther("1000"));
      const balance = await poolContract.balanceOf(
        await secondAccount.getAddress()
      );

      const totSupply = await poolContract.totalSupply();
      expect(balance).to.equal(totSupply.sub(BigNumber.from(1000)));
    });

    it("should not create pool if it exist ", async () => {
      const allPairsLength = await factory.allPairsLength();
      const newSushi = (await sushiFactory.deploy(
        manager.address
      )) as SushiSwapPool;
      const allPairsLengthAfterDeploy = await factory.allPairsLength();
      expect(allPairsLength).to.equal(allPairsLengthAfterDeploy);
      expect(await newSushi.pair()).to.equal(await sushi.pair());
    });

    // todo call add function of the master chef to add our pool and earn sushi
  });
});
