import { Signer, BigNumber, ContractFactory } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";

import { MasterChefOriginal } from "../artifacts/types/MasterChefOriginal";
import { IUniswapV2Factory } from "../artifacts/types/IUniswapV2Factory";
import { IUniswapV2Pair } from "../artifacts/types/IUniswapV2Pair";
import { IUniswapV2Router02 } from "../artifacts/types/IUniswapV2Router02";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { mineNBlock } from "./utils/hardhatNode";

const reserveA = "1518287028779922369700";
const reserveB = "15598625844";
const nbPairs = 41240;
const USDTToken = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT
const factoryAdr = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"; // UniV2Factory mainnet
const routerAdr = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // UniV2Router02

describe("SushiSwapPool", () => {
  let admin: Signer;
  let secondAccount: Signer;
  let manager: UbiquityAlgorithmicDollarManager;
  let masterChef: MasterChefOriginal;
  let sushiFactory: ContractFactory;
  let router: IUniswapV2Router02;
  let factory: IUniswapV2Factory;
  let uADUGOVPair: IUniswapV2Pair;
  let uGOVPair: string;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;
  let sushiMultiSig: string;
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
    /*  */

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setDollarTokenAddress(uAD.address);

    const UGOV = await ethers.getContractFactory("UbiquityGovernance");
    uGOV = (await UGOV.deploy(manager.address)) as UbiquityGovernance;
    await manager.setGovernanceTokenAddress(uGOV.address);

    let pool = await factory.getPair(
      await manager.dollarTokenAddress(),
      await manager.governanceTokenAddress()
    );

    if (pool === ethers.constants.AddressZero) {
      const tx = await factory.createPair(
        await manager.dollarTokenAddress(),
        await manager.governanceTokenAddress()
      );
      await tx.wait();
      pool = await factory.getPair(
        await manager.dollarTokenAddress(),
        await manager.governanceTokenAddress()
      );
    }
    uADUGOVPair = (await ethers.getContractAt(
      "IUniswapV2Pair",
      pool
    )) as IUniswapV2Pair;

    /*   sushiFactory = await ethers.getContractFactory("SushiSwapPool");
    sushiUGOVPool = (await sushiFactory.deploy(
      manager.address
    )) as SushiSwapPool; */

    const mintings = [await secondAccount.getAddress()].map(
      async (signer): Promise<void> => {
        await uAD.mint(signer, ethers.utils.parseEther("10000"));
        await uGOV.mint(signer, ethers.utils.parseEther("1000"));
      }
    );
    await Promise.all(mintings);

    // DEPLOY MasterChef
    const UBQ_MINTER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
    );
    const curBlockNum = await ethers.provider.getBlockNumber();
    masterChef = (await (
      await ethers.getContractFactory("MasterChefOriginal")
    ).deploy(
      manager.address,
      ethers.utils.parseEther("1"),
      curBlockNum,
      curBlockNum + 10
    )) as MasterChefOriginal;
    await manager.setMasterChefAddress(masterChef.address);
    await manager.grantRole(UBQ_MINTER_ROLE, masterChef.address);

    const managerMasterChefAddress = await manager.masterChefAddress();
    expect(masterChef.address).to.be.equal(managerMasterChefAddress);
  });

  describe("UniSwap Factory", () => {
    it(`should get ${nbPairs} pairs`, async () => {
      const allPairsLength: BigNumber = await factory.allPairsLength();

      expect(allPairsLength).to.be.equal(nbPairs);
    });
    it("should get last pair", async () => {
      const pair = await factory.allPairs(nbPairs);
      expect(pair).to.be.equal(uADUGOVPair.address);
    });
  });

  describe("UniSwap first Pair", () => {
    it("should get factory address from first pair", async () => {
      const pairFactoryAddress = await uADUGOVPair.factory();
      expect(pairFactoryAddress).to.be.equal(factory.address);
    });
    it("should get tokens, reserves of first pair", async () => {
      const token0 = await uADUGOVPair.token0();
      const token1 = await uADUGOVPair.token1();
      const [reserve0, reserve1] = await uADUGOVPair.getReserves();

      expect(token0).to.be.equal(uGOV.address);
      expect(token1).to.be.equal(uAD.address);
      expect(reserve0).to.be.equal(0);
      expect(reserve1).to.be.equal(0);
    });
  });

  describe("UniSwap", () => {
    it("should create pool", async () => {
      const token0 = await uADUGOVPair.token0();
      const token1 = await uADUGOVPair.token1();
      const [reserve0, reserve1] = await uADUGOVPair.getReserves();

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
      let [reserve0, reserve1] = await uADUGOVPair.getReserves();
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
      const totSupplyBefore = await uADUGOVPair.totalSupply();
      expect(totSupplyBefore).to.equal(0);
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
        .to.emit(uADUGOVPair, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          1000
        );

      [reserve0, reserve1] = await uADUGOVPair.getReserves();
      if ((await uADUGOVPair.token0()) === uAD.address) {
        expect(reserve0).to.equal(ethers.utils.parseEther("10000"));
        expect(reserve1).to.equal(ethers.utils.parseEther("1000"));
      } else {
        expect(reserve1).to.equal(ethers.utils.parseEther("10000"));
        expect(reserve0).to.equal(ethers.utils.parseEther("1000"));
      }

      const balance = await uADUGOVPair.balanceOf(
        await secondAccount.getAddress()
      );

      const totSupply = await uADUGOVPair.totalSupply();
      // a small amount is burned for the first deposit
      // see https://uniswap.org/whitepaper.pdf page 9 second paragraph
      expect(balance).to.equal(totSupply.sub(BigNumber.from(1000)));
    });

    it.only("should add pool and earn UBQ", async () => {
      const secondAccAdr = await secondAccount.getAddress();
      // must allow to transfer token
      await uAD
        .connect(secondAccount)
        .approve(routerAdr, ethers.utils.parseEther("10000"));
      await uGOV
        .connect(secondAccount)
        .approve(routerAdr, ethers.utils.parseEther("1000"));
      // If the liquidity is to be added to an ERC-20/ERC-20 pair, use addLiquidity.
      const blockBefore = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      await router
        .connect(secondAccount)
        .addLiquidity(
          uAD.address,
          uGOV.address,
          ethers.utils.parseEther("10000"),
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("9900"),
          ethers.utils.parseEther("990"),
          secondAccAdr,
          blockBefore.timestamp + 100
        );
      const balanceBefore = await uADUGOVPair.balanceOf(secondAccAdr);
      const masterChef = (await ethers.getContractAt(
        "MasterChefOriginal",
        await manager.masterChefAddress()
      )) as MasterChefOriginal;
      const poolLengthBefore = await masterChef.poolLength();
      const owner = await masterChef.owner();
      expect(owner).to.equal(await admin.getAddress());
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [sushiMultiSig],
      });
      await secondAccount.sendTransaction({
        to: sushiMultiSig,
        value: ethers.utils.parseEther("1.0"),
      });

      const totAllocPoint = await masterChef.totalAllocPoint();
      const sushiChef = ethers.provider.getSigner(sushiMultiSig);
      // insert uGOV-UAD as onsen pair we will get half of all the sushi reward
      const blockNum = await ethers.provider.getBlockNumber();
      await masterChef.connect(sushiChef).add(totAllocPoint, uGOVPair, true);
      const totAllocPointAfterAdd = await masterChef.totalAllocPoint();
      expect(totAllocPointAfterAdd).to.equal(
        totAllocPoint.mul(BigNumber.from(2))
      );
      const poolLengthAfter = await masterChef.poolLength();
      // ugov pid should be the last index
      const uGOVpid = poolLengthAfter.sub(BigNumber.from(1));
      const pooluGOV = await masterChef.poolInfo(uGOVpid);

      expect(poolLengthAfter).to.equal(poolLengthBefore.add(BigNumber.from(1)));
      expect(pooluGOV.lpToken).to.equal(uGOVPair);
      expect(pooluGOV.allocPoint).to.equal(totAllocPoint);
      expect(pooluGOV.lastRewardBlock).to.equal(blockNum + 1);
      expect(pooluGOV.accUbqPerShare).to.equal(0);

      // deposit lp tokens
      // must allow to transfer LP token
      await uADUGOVPair
        .connect(secondAccount)
        .approve(masterChef.address, balanceBefore);

      // deposit all LP token
      await masterChef.connect(secondAccount).deposit(uGOVpid, balanceBefore);
      const uInfo = await masterChef.userInfo(uGOVpid, secondAccAdr);
      expect(uInfo.amount).to.equal(balanceBefore);
      expect(uInfo.rewardDebt).to.equal(0);

      const balanceAfter = await uADUGOVPair.balanceOf(secondAccAdr);
      expect(balanceAfter).to.equal(0);
      // pending sushi reward
      let pendingReward = await masterChef.pendingUBQ(uGOVpid, secondAccAdr);
      expect(pendingReward).to.equal(0);

      // after one block we should be able to retrieve sushi
      await mineNBlock(1);
      pendingReward = await masterChef.pendingUBQ(uGOVpid, secondAccAdr);
      const sushiPerBlock = await masterChef.ubqPerBlock();
      // we have half of the total allocation point so we are entitled to half the sushi per block

      // take into consideration precision
      expect(pendingReward).to.be.lte(sushiPerBlock);
      expect(pendingReward).to.be.gte(sushiPerBlock.mul(9999).div(20000));
    });
  });
});
