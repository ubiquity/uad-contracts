import { Signer, BigNumber } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SushiSwapPool } from "../artifacts/types/SushiSwapPool";
import { IUniswapV2Factory } from "../artifacts/types/IUniswapV2Factory";
import { IUniswapV2Pair } from "../artifacts/types/IUniswapV2Pair";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";

const tokenA = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const tokenB = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const firstPair = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
const nbPairs = 31941;

describe("SushiSwapPool", () => {
  let admin: Signer;
  let manager: UbiquityAlgorithmicDollarManager;
  let sushi: SushiSwapPool;
  let factoryContract: IUniswapV2Factory;
  let onePairContract: IUniswapV2Pair;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;

  beforeEach(async () => {
    [admin] = await ethers.getSigners();
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    factoryContract = (await ethers.getContractAt(
      "IUniswapV2Factory",
      factory
    )) as IUniswapV2Factory;
    onePairContract = (await ethers.getContractAt(
      "IUniswapV2Pair",
      firstPair
    )) as IUniswapV2Pair;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;

    const UGOV = await ethers.getContractFactory("UbiquityGovernance");
    uGOV = (await UGOV.deploy(manager.address)) as UbiquityGovernance;

    const Sushi = await ethers.getContractFactory("SushiSwapPool");
    sushi = (await Sushi.deploy(
      manager.address,
      uAD.address,
      uGOV.address
    )) as SushiSwapPool;
  });

  describe("UniSwap Factory", () => {
    it(`should get ${nbPairs} pairs`, async () => {
      const allPairsLength: BigNumber = await factoryContract.allPairsLength();

      expect(allPairsLength).to.be.equal(nbPairs);
    });
    it("should get first pair 0xB4e...", async () => {
      const pair = await factoryContract.allPairs(0);

      expect(pair).to.be.equal(firstPair);
    });
  });

  describe("UniSwap Pair", () => {
    it("should get factory address from first pair", async () => {
      const pairFactoryAddress = await onePairContract.factory();

      expect(pairFactoryAddress).to.be.equal(factory);
    });
    it("should get tokens, reserves of first pair", async () => {
      const token0 = await onePairContract.token0();
      const token1 = await onePairContract.token1();
      const [reserve0, reserve1] = await onePairContract.getReserves();

      expect(token0).to.be.equal(tokenA);
      expect(token1).to.be.equal(tokenB);
      expect(reserve0).to.be.equal("144065947714472");
      expect(reserve1).to.be.equal("75512578800914566328215");
    });
  });

  describe("SushiSwap", () => {
    it("should create pool", async () => {
      const pool = await sushi.pool();

      const allPairsLength: BigNumber = await factoryContract.allPairsLength();

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
  });
});
