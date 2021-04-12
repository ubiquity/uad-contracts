/* eslint-disable @typescript-eslint/no-unused-expressions */
import { ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { describe, it } from "mocha";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { expect } from "./setup";
import { mineBlock, resetFork } from "./utils/hardhatNode";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";

describe("TWAPOracle", () => {
  let metaPool: IMetaPool;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let DAI: string;
  let USDC: string;
  let USDT: string;
  let curvePoolFactory: ICurveFactory;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let crvToken: ERC20;
  let daiToken: ERC20;
  let curveWhaleAddress: string;
  let twapOracle: TWAPOracle;

  beforeEach(async () => {
    ({
      DAI,
      USDC,
      USDT,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();
    await resetFork(12150000);
    const Manager = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await Manager.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    /*   const Manager = await deployments.deploy(
      "UbiquityAlgorithmicDollarManager",
      {
        from: await admin.getAddress(),
        args: [await admin.getAddress()],
      }
    ); */
    // manager = new ethers.Contract(Manager.address, Manager.abi, provider);
    /*  manager = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollarManager",
      Manager.address
    )) as UbiquityAlgorithmicDollarManager; */

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy()) as UbiquityAlgorithmicDollar;

    /*   const UAD = await deployments.deploy("UbiquityAlgorithmicDollar", {
      from: await admin.getAddress(),
    });

    uAD = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollar",
      UAD.address
    )) as UbiquityAlgorithmicDollar; */

    // mint 10000 uAD each for admin and secondAccount
    const mintings = [
      await admin.getAddress(),
      await secondAccount.getAddress(),
      manager.address,
    ].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.connect(admin).mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    await manager.connect(admin).setuADTokenAddress(uAD.address);

    crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;
    daiToken = (await ethers.getContractAt("ERC20", DAI)) as ERC20;
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });

    const curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    // mint uad for whale
    await uAD
      .connect(admin)
      .mint(curveWhaleAddress, ethers.utils.parseEther("10"));

    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));

    await manager
      .connect(admin)
      .deployStableSwapPool(
        curveFactory,
        curve3CrvBasePool,
        crvToken.address,
        10,
        4000000
      );

    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;

    /*  const TWAPOracleDeployment = await deployments.deploy("TWAPOracle", {
      from: await admin.getAddress(),
      args: [metaPoolAddr, uAD.address, curve3CrvToken],
    });

    twapOracle = (await ethers.getContractAt(
      "TWAPOracle",
      TWAPOracleDeployment.address
    )) as TWAPOracle; */

    const TWAPOracleDeployment = await ethers.getContractFactory("TWAPOracle");
    twapOracle = (await TWAPOracleDeployment.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;

    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);

    curvePoolFactory = (await ethers.getContractAt(
      "ICurveFactory",
      curveFactory
    )) as ICurveFactory;
  });
  describe("Oracle", () => {
    it("should return correct price of 1 usd at pool init", async () => {
      const pool0bal = await metaPool.balances(0);
      const pool1bal = await metaPool.balances(1);
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));
      const oraclePriceuAD = await twapOracle.consult(uAD.address);
      const oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      expect(oraclePriceuAD).to.equal(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.equal(ethers.utils.parseEther("1"));
    });
    it("should return correct price after a swap for token", async () => {
      const pool0balBefore = await metaPool.balances(0);
      const pool1balBefore = await metaPool.balances(1);
      expect(pool0balBefore).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1balBefore).to.equal(ethers.utils.parseEther("10000"));
      const balancesBefore = await curvePoolFactory.get_balances(
        metaPool.address
      );
      let oraclePriceuAD = await twapOracle.consult(uAD.address);
      let oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      expect(oraclePriceuAD).to.equal(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.equal(ethers.utils.parseEther("1"));
      // Exchange (swap) uAD => 3CRV
      const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      const expectedMin3CRV = dyuADto3CRV.div(100).mul(99);

      // secondAccount need to approve metaPool for sending its uAD
      await uAD
        .connect(secondAccount)
        .approve(metaPool.address, ethers.utils.parseEther("1"));
      // secondAccount swap 1uAD => x 3CRV
      await metaPool
        .connect(secondAccount)
        ["exchange(int128,int128,uint256,uint256)"](
          0,
          1,
          ethers.utils.parseEther("1"),
          expectedMin3CRV
        );
      const secondAccount3CRVBalanceAfterSwap = await crvToken.balanceOf(
        await secondAccount.getAddress()
      );
      await twapOracle.update();
      oraclePriceuAD = await twapOracle.consult(uAD.address);
      oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      // we now have more uAD than 3CRV wich means that uAD is worth less than 3CRV
      expect(oraclePriceuAD).to.be.lt(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.be.gt(ethers.utils.parseEther("1"));
      const pool0balAfter = await metaPool.balances(0);
      const pool1balAfter = await metaPool.balances(1);
      const balancesAfter = await curvePoolFactory.get_balances(
        metaPool.address
      );
      expect(pool0balAfter).to.equal(
        pool0balBefore.add(ethers.utils.parseEther("1"))
      );

      // we now have less 3CRV
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(0);
      const adminFee = await curvePoolFactory.get_admin_balances(
        metaPool.address
      );

      // in the basepool 3CRV we should be short the dai amount transfered to the user + admin fees (50% of trade fee)
      // for exchanges the fee is taken in the output currency and calculated against the final amount received.
      expect(pool1balAfter).to.equal(
        pool1balBefore.sub(dyuADto3CRV.add(adminFee[1]))
      );
      // second account DAI Balance should be equal to the estimate swap amount
      expect(secondAccount3CRVBalanceAfterSwap).to.be.equal(dyuADto3CRV);
      // pool1Blance should be less than before the swap
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(0);
      // uAD balance in the pool should be equal to before + 1
      expect(balancesAfter[0].sub(balancesBefore[0])).to.equal(
        ethers.utils.parseEther("1")
      );
      // 3CRV balance in the pool should be less than before the swap
      expect(balancesBefore[1].sub(balancesAfter[1])).to.be.gt(0);

      // we should have positive fee in 3CRV
      expect(adminFee[1]).to.be.gt(0);

      await twapOracle.update();
      const oraclePriceuADAfter = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter).to.be.lt(ethers.utils.parseEther("1"));
      // if no swap after x block the price stays the same
      const LastBlockTimestamp = await metaPool.block_timestamp_last();
      const blockTimestamp = LastBlockTimestamp.toNumber() + 23 * 3600;
      await mineBlock(blockTimestamp);
      await twapOracle.update();
      const oraclePriceAfterMine = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter.sub(oraclePriceAfterMine)).to.equal(0);
    });
    it("should return correct price after a swap for underlying token", async () => {
      const pool0balBefore = await metaPool.balances(0);
      const pool1balBefore = await metaPool.balances(1);
      expect(pool0balBefore).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1balBefore).to.equal(ethers.utils.parseEther("10000"));
      const balancesBefore = await curvePoolFactory.get_underlying_balances(
        metaPool.address
      );
      let oraclePriceuAD = await twapOracle.consult(uAD.address);
      let oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      expect(oraclePriceuAD).to.equal(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.equal(ethers.utils.parseEther("1"));
      // Exchange (swap)
      const dyuADtoDAI = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 1, ethers.utils.parseEther("1"));
      const expectedMinDAI = dyuADtoDAI.div(100).mul(99);

      // secondAccount need to approve metaPool for sending its uAD
      await uAD
        .connect(secondAccount)
        .approve(metaPool.address, ethers.utils.parseEther("1"));
      // secondAccount swap 1uAD => 1 DAI
      await metaPool
        .connect(secondAccount)
        ["exchange_underlying(int128,int128,uint256,uint256)"](
          0,
          1,
          ethers.utils.parseEther("1"),
          expectedMinDAI
        );
      const secondAccountDAIBalanceAfterSwap = await daiToken.balanceOf(
        await secondAccount.getAddress()
      );
      await twapOracle.update();
      oraclePriceuAD = await twapOracle.consult(uAD.address);
      oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      // we now have more uAD than 3CRV wich means that uAD is worth less than 3CRV
      expect(oraclePriceuAD).to.be.lt(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.be.gt(ethers.utils.parseEther("1"));
      const pool0balAfter = await metaPool.balances(0);
      const pool1balAfter = await metaPool.balances(1);
      const balancesAfter = await curvePoolFactory.get_underlying_balances(
        metaPool.address
      );
      expect(pool0balAfter).to.equal(
        pool0balBefore.add(ethers.utils.parseEther("1"))
      );
      // we now have less 3CRV
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(1);
      const adminFee = await curvePoolFactory.get_admin_balances(
        metaPool.address
      );

      // second account DAI Balance should be equal to the estimate swap amount
      expect(secondAccountDAIBalanceAfterSwap).to.be.equal(dyuADtoDAI);
      // pool1Blance should be less than before the swap
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(0);
      // uAD balance in the pool should be equal to before + 1
      expect(balancesAfter[0].sub(balancesBefore[0])).to.equal(
        ethers.utils.parseEther("1")
      );
      // Dai balance in the pool should be less than before the swap
      expect(balancesBefore[1].sub(balancesAfter[1])).to.be.gt(0);
      // USDC balance in the pool should be less than before the swap
      expect(balancesBefore[2].sub(balancesAfter[2])).to.be.gt(0);
      // USDT balance in the pool should be less than before the swap
      expect(balancesBefore[3].sub(balancesAfter[3])).to.be.gt(0);
      // we should have positive fee in 3CRV
      expect(adminFee[1]).to.be.gt(0);

      await twapOracle.update();
      const oraclePriceuADAfter = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter).to.be.lt(ethers.utils.parseEther("1"));
      // if no swap after x block the price stays the same
      const LastBlockTimestamp = await metaPool.block_timestamp_last();
      const blockTimestamp = LastBlockTimestamp.toNumber() + 23 * 3600;
      await mineBlock(blockTimestamp);
      await twapOracle.update();
      const oraclePriceAfterMine = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter.sub(oraclePriceAfterMine)).to.equal(0);
    });
  });
  describe("MetaPool", () => {
    it("should perform an exchange between uAD and DAI", async () => {
      // Performs an exchange between two tokens.
      const uAD2ndBalbeforeSWAP = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      // Exchange (swap)
      const dyuADtoDAI = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 1, ethers.utils.parseEther("1"));
      const expectedMinDAI = dyuADtoDAI.div(100).mul(99);

      // secondAccount need to approve metaPool for sending its uAD
      await uAD
        .connect(secondAccount)
        .approve(metaPool.address, ethers.utils.parseEther("1"));
      // secondAccount swap 1uAD to 1 DAI
      await metaPool
        .connect(secondAccount)
        ["exchange_underlying(int128,int128,uint256,uint256)"](
          0,
          1,
          ethers.utils.parseEther("1"),
          expectedMinDAI
        );
      const secondAccountDAIBalance = await daiToken.balanceOf(
        await secondAccount.getAddress()
      );
      const secondAccountuADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      expect(secondAccountDAIBalance).to.equal(dyuADtoDAI);
      expect(secondAccountuADBalance).to.equal(
        uAD2ndBalbeforeSWAP.sub(ethers.utils.parseEther("1"))
      );
    });
    it("should perform an exchange between uAD and 3CRV", async () => {
      // Performs an exchange between two tokens.
      const uAD2ndBalbeforeSWAP = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      // Exchange (swap)
      const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      const expectedMin3CRV = dyuADto3CRV.div(100).mul(99);

      // secondAccount need to approve metaPool for sending its uAD
      await uAD
        .connect(secondAccount)
        .approve(metaPool.address, ethers.utils.parseEther("1"));
      // secondAccount swap 1uAD to 1 DAI
      await metaPool
        .connect(secondAccount)
        ["exchange(int128,int128,uint256,uint256)"](
          0,
          1,
          ethers.utils.parseEther("1"),
          expectedMin3CRV
        );
      const secondAccount3CRVBalance = await crvToken.balanceOf(
        await secondAccount.getAddress()
      );
      const secondAccountuADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      expect(secondAccount3CRVBalance).to.equal(dyuADto3CRV);
      expect(secondAccountuADBalance).to.equal(
        uAD2ndBalbeforeSWAP.sub(ethers.utils.parseEther("1"))
      );
    });
    it("should return correct pool balance", async () => {
      const pool0bal = await metaPool.balances(0);
      const pool1bal = await metaPool.balances(1);
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));
    });
    it("should return correct token price", async () => {
      await twapOracle.update();

      const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      /*   console.log(`
 oraclePriceuAD:${oraclePriceuAD}
oraclePrice3Crv:${oraclePrice3Crv}
      virtPrice:${virtPrice}
       pool0bal:${pool0bal}
       pool1bal:${pool1bal}
    dyuADto3CRV:${dyuADto3CRV}
      `); */
      expect(dyuADto3CRV).to.equal("986194034853243644");
    });
    it("should return correct underlying token price", async () => {
      const dyuAD2USDT = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 3, ethers.utils.parseEther("1"));
      expect(dyuAD2USDT).to.equal("1000678");
      const dyDAI2USDT = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](1, 3, ethers.utils.parseEther("1"));
      expect(dyDAI2USDT).to.equal("999691");
      const dyuAD2DAI = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 1, ethers.utils.parseEther("1"));
      expect(dyuAD2DAI).to.equal("1000581977224732088");
      const dyDAI2uAD = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](1, 0, ethers.utils.parseEther("1"));
      expect(dyDAI2uAD).to.equal("998193085467601000");
    });
  });
  describe("CurvePoolFactory", () => {
    it("should return correct number of coins and underlying coins within a pool", async () => {
      // Get the number of coins and underlying coins within a pool.
      const nCoins = await curvePoolFactory.get_n_coins(metaPool.address);
      expect(nCoins[0]).to.equal(2);
      expect(nCoins[1]).to.equal(4);
    });
    it("should return a list of the swappable coins within a pool", async () => {
      // Get a list of the swappable coins within a pool.
      const coins = await curvePoolFactory.get_coins(metaPool.address);
      expect(coins[0].toString()).to.equal(uAD.address);
      expect(coins[1].toString()).to.equal(curve3CrvToken);
    });
    it("should return a list of the swappable underlying coins within a pool", async () => {
      // Get a list of the swappable underlying coins within a pool.
      const underCoins = await curvePoolFactory.get_underlying_coins(
        metaPool.address
      );
      expect(underCoins[0].toString()).to.equal(uAD.address);
      expect(underCoins[1].toString()).to.equal(DAI);
      expect(underCoins[2].toString()).to.equal(USDC);
      expect(underCoins[3].toString()).to.equal(USDT);
    });
    it("should a list of decimal places for each coin within a pool.", async () => {
      // Get a list of decimal places for each coin within a pool.
      const decimalCoins = await curvePoolFactory.get_underlying_decimals(
        metaPool.address
      );
      expect(decimalCoins[0]).to.equal(18);
      expect(decimalCoins[1]).to.equal(18);
      expect(decimalCoins[2]).to.equal(6);
      expect(decimalCoins[3]).to.equal(6);
    });
    it("should convert coin addresses into indices for use with pool methods.", async () => {
      // Convert coin addresses into indices for use with pool methods.
      const indices = await curvePoolFactory.get_coin_indices(
        metaPool.address,
        DAI,
        USDT
      );
      expect(indices[2]).to.be.true;
      expect(indices[0]).to.equal(1);
      expect(indices[1]).to.equal(3);
    });
    it("should get available balances for each underlying coin within a pool.", async () => {
      // Get available balances for each coin within a pool.
      const balances = await curvePoolFactory.get_underlying_balances(
        metaPool.address
      );
      expect(balances[0]).to.equal(ethers.utils.parseEther("10000"));
      expect(balances[1]).to.equal("3095551850613512101118");
      expect(balances[2]).to.equal("3796702941");
      expect(balances[3]).to.equal("3257341594");
    });
    it("should get the exchange rates between coins and underlying coins within a pool.", async () => {
      // Get the exchange rates between coins and underlying coins within a pool, normalized to a 1e18 precision.
      const rates = await curvePoolFactory.get_rates(metaPool.address);
      expect(rates[0]).to.equal(ethers.utils.parseEther("1"));
      expect(rates[1]).to.equal(
        ethers.utils.parseEther("1.014953153764877573")
      );
    });
    it("should get virtual price.", async () => {
      // Getter virtual price.
      const virtPrice = await metaPool.get_virtual_price();
      expect(virtPrice).to.equal(ethers.utils.parseEther("1"));
    });
  });
});
