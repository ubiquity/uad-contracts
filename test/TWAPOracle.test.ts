/* eslint-disable @typescript-eslint/no-unused-expressions */
import { BigNumber, ContractTransaction, Signer } from "ethers";
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
  let curveWhale: Signer;
  let twapOracle: TWAPOracle;

  const swapUADtoDAI = async (
    amount: BigNumber,
    signer: Signer
  ): Promise<BigNumber> => {
    const dyuADtoDAI = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](0, 1, amount);
    const expectedMinDAI = dyuADtoDAI.div(100).mul(99);

    // secondAccount need to approve metaPool for sending its uAD
    await uAD.connect(signer).approve(metaPool.address, amount);
    // secondAccount swap 1uAD => 1 DAI
    await metaPool
      .connect(signer)
      ["exchange_underlying(int128,int128,uint256,uint256)"](
        0,
        1,
        amount,
        expectedMinDAI
      );
    return dyuADtoDAI;
  };

  const swap3CRVtoUAD = async (
    amount: BigNumber,
    signer: Signer
  ): Promise<BigNumber> => {
    const dy3CRVtouAD = await metaPool["get_dy(int128,int128,uint256)"](
      1,
      0,
      amount
    );
    const expectedMinuAD = dy3CRVtouAD.div(100).mul(99);

    // signer need to approve metaPool for sending its coin
    await crvToken.connect(signer).approve(metaPool.address, amount);
    // secondAccount swap   3CRV=> x uAD
    await metaPool
      .connect(signer)
      ["exchange(int128,int128,uint256,uint256)"](1, 0, amount, expectedMinuAD);
    return dy3CRVtouAD;
  };
  const swapUADto3CRV = async (
    amount: BigNumber,
    signer: Signer
  ): Promise<BigNumber> => {
    const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
      0,
      1,
      amount
    );
    const expectedMin3CRV = dyuADto3CRV.div(100).mul(99);

    // signer need to approve metaPool for sending its coin
    await uAD.connect(signer).approve(metaPool.address, amount);
    // secondAccount swap   3CRV=> x uAD
    await metaPool
      .connect(signer)
      ["exchange(int128,int128,uint256,uint256)"](
        0,
        1,
        amount,
        expectedMin3CRV
      );
    return dyuADto3CRV;
  };
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

    curveWhale = ethers.provider.getSigner(curveWhaleAddress);
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
    it("should return a higher price for 3CRV after a swap from uAD to 3CRV", async () => {
      const pool0balBefore = await metaPool.balances(0);
      const pool1balBefore = await metaPool.balances(1);
      const balancesBefore = await curvePoolFactory.get_balances(
        metaPool.address
      );
      // take the 3CRV price at this moment
      const curve3CRVPriceBefore = await metaPool[
        "get_dy(int128,int128,uint256)"
      ](1, 0, ethers.utils.parseEther("1"));
      console.log(`
      **-*-*-*-*-*--*curve3CRVPriceBefore:${ethers.utils.formatEther(
        curve3CRVPriceBefore
      )}
           `);
      const curveUADPriceBefore = await metaPool[
        "get_dy(int128,int128,uint256)"
      ](0, 1, ethers.utils.parseEther("1"));
      console.log(`
      **-*-*-*-*-*--*curveUADPriceBefore:${ethers.utils.formatEther(
        curveUADPriceBefore
      )}
           `);

      const amountOfuADToSwap = ethers.utils.parseEther("1000");
      const accountAdr = await secondAccount.getAddress();
      const accountUADBalanceBeforeSwap = await uAD.balanceOf(accountAdr);

      let oraclePriceuAD = await twapOracle.consult(uAD.address);
      let oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      expect(oraclePriceuAD).to.equal(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.equal(ethers.utils.parseEther("1"));

      const account3CRVBalanceBeforeSwap = await crvToken.balanceOf(accountAdr);
      console.log(`
      **-*-*-*-*-*--*accountUADBalanceBeforeSwap:${ethers.utils.formatEther(
        accountUADBalanceBeforeSwap
      )}`);
      // Exchange (swap)  uAD=>  3CRV
      const dyUADto3CRV = await swapUADto3CRV(
        amountOfuADToSwap.sub(BigNumber.from(1)),
        secondAccount
      );
      await twapOracle.update();
      const oraclePriceuADBefore = await twapOracle.consult(uAD.address);
      const oraclePrice3CrvBefore = await twapOracle.consult(curve3CrvToken);
      console.log(`
      **-*-*-*-*-*--*oraclePriceuADBefore:${ethers.utils.formatEther(
        oraclePriceuADBefore
      )}  oraclePrice3CrvBefore:${ethers.utils.formatEther(
        oraclePrice3CrvBefore
      )}
           `);
      // the way TWAP work doesn't include the new price yet but we can have it
      // through dy
      const curve3CRVPriceAfterSwap = await metaPool[
        "get_dy(int128,int128,uint256)"
      ](1, 0, ethers.utils.parseEther("1"));
      console.log(`
      **-*-*-*-*-*--*curve3CRVPriceAfterSwap:${ethers.utils.formatEther(
        curve3CRVPriceAfterSwap
      )}
           `);
      const curveUADPriceAfterSwap = await metaPool[
        "get_dy(int128,int128,uint256)"
      ](0, 1, ethers.utils.parseEther("1"));
      console.log(`
 **-*-*-*-*-*--*curveUADPriceAfterSwap:${ethers.utils.formatEther(
   curveUADPriceAfterSwap
 )}
      `);
      expect(curve3CRVPriceAfterSwap).to.be.gt(curve3CRVPriceBefore);
      expect(curveUADPriceAfterSwap).to.be.lt(curveUADPriceBefore);
      // to reflect the new price inside the TWAP we need one more swap
      await swapUADto3CRV(BigNumber.from(1), secondAccount);
      dyUADto3CRV.add(BigNumber.from(1));

      await twapOracle.update();
      oraclePriceuAD = await twapOracle.consult(uAD.address);
      oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      console.log(`
      **-*-*-*-*-*--*oraclePriceuAD:${ethers.utils.formatEther(
        oraclePriceuAD
      )}  oraclePrice3Crv:${ethers.utils.formatEther(oraclePrice3Crv)}
           `);
      // we now have more uAD than before wich means that uAD is worth less than before
      // and 3CRV is worth more than before
      expect(oraclePriceuAD).to.be.lt(oraclePriceuADBefore);
      expect(oraclePrice3Crv).to.be.gt(oraclePrice3CrvBefore);
      const pool0balAfter = await metaPool.balances(0);
      const pool1balAfter = await metaPool.balances(1);
      const balancesAfter = await curvePoolFactory.get_balances(
        metaPool.address
      );
      expect(pool0balAfter).to.equal(pool0balBefore.add(amountOfuADToSwap));

      // we now have less 3CRV
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(0);
      const adminFee = await curvePoolFactory.get_admin_balances(
        metaPool.address
      );

      // in the basepool we should be short the 3CRV amount transfered to the user + admin fees (50% of trade fee)
      // for exchanges the fee is taken in the output currency and calculated against the final amount received.
      expect(pool1balAfter).to.equal(
        pool1balBefore.sub(dyUADto3CRV.add(adminFee[1]))
      );
      // account 3crv Balance should be equal to the estimate swap amount
      const account3CRVBalanceAfterSwap = await crvToken.balanceOf(accountAdr);
      console.log(`
      **-*-*-*-*-*--*account3CRVBalanceAfterSwap:${ethers.utils.formatEther(
        account3CRVBalanceAfterSwap
      )}
      dyUADto3CRV:${ethers.utils.formatEther(dyUADto3CRV)}
           `);
      expect(account3CRVBalanceAfterSwap).to.be.equal(
        account3CRVBalanceBeforeSwap.add(dyUADto3CRV)
      );
      const accountuADBalanceAfterSwap = await uAD.balanceOf(accountAdr);
      expect(accountuADBalanceAfterSwap).to.be.equal(
        accountUADBalanceBeforeSwap.sub(amountOfuADToSwap)
      );
      // pool1Blance should be less than before the swap
      expect(pool1balBefore.sub(pool1balAfter)).to.be.gt(0);
      // UAD balance in the pool should be equal to before + amount
      expect(balancesAfter[0].sub(balancesBefore[0])).to.equal(
        amountOfuADToSwap
      );
      // 3CRV balance in the pool should be less than before the swap
      expect(balancesBefore[1].sub(balancesAfter[1])).to.be.gt(0);

      // we should have positive fee in 3CRV
      expect(adminFee[1]).to.be.gt(0);

      // if no swap after x block the price stays the same
      const LastBlockTimestamp = await metaPool.block_timestamp_last();
      const blockTimestamp = LastBlockTimestamp.toNumber() + 23 * 3600;
      await mineBlock(blockTimestamp);
      await twapOracle.update();
      const oraclePriceAfterMine = await twapOracle.consult(uAD.address);
      expect(oraclePriceuAD.sub(oraclePriceAfterMine)).to.equal(0);
    });
    it("should return a higher price for uAD after a swap from 3CRV to uad", async () => {
      const pool0balBefore = await metaPool.balances(0);
      const pool1balBefore = await metaPool.balances(1);
      expect(pool0balBefore).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1balBefore).to.equal(ethers.utils.parseEther("10000"));
      const balancesBefore = await curvePoolFactory.get_balances(
        metaPool.address
      );
      const amountOf3CRVToSwap = ethers.utils.parseEther("1000");
      const whaleUADBalanceBeforeSwap = await uAD.balanceOf(curveWhaleAddress);

      let oraclePriceuAD = await twapOracle.consult(uAD.address);
      let oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      expect(oraclePriceuAD).to.equal(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.equal(ethers.utils.parseEther("1"));
      const uADPricea = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      console.log(`
 **-*-*-*-*-*--*uADPricea:${ethers.utils.formatEther(uADPricea)}
      `);
      const whale3CRVBalanceBeforeSwap = await crvToken.balanceOf(
        curveWhaleAddress
      );

      // Exchange (swap)  3CRV => uAD
      const dy3CRVtouAD = await swap3CRVtoUAD(
        amountOf3CRVToSwap.sub(BigNumber.from(1)),
        curveWhale
      );
      await twapOracle.update();

      // the way TWAP work doesn't include the new price yet but we can have it
      // through dy
      const uADPrice = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      console.log(`
 **-*-*-*-*-*--*uADPrice:${ethers.utils.formatEther(uADPrice)}
      `);
      expect(uADPrice).to.be.gt(ethers.utils.parseEther("1"));
      // to reflect the new price inside the TWAP we need one more swap
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      dy3CRVtouAD.add(BigNumber.from(1));

      await twapOracle.update();
      oraclePriceuAD = await twapOracle.consult(uAD.address);
      oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
      // we now have more 3CRV  than uAD  wich means that 3CRV is worth less than uAD
      expect(oraclePriceuAD).to.be.gt(ethers.utils.parseEther("1"));
      expect(oraclePrice3Crv).to.be.lt(ethers.utils.parseEther("1"));
      const pool0balAfter = await metaPool.balances(0);
      const pool1balAfter = await metaPool.balances(1);
      const balancesAfter = await curvePoolFactory.get_balances(
        metaPool.address
      );
      expect(pool1balAfter).to.equal(pool1balBefore.add(amountOf3CRVToSwap));

      // we now have less uAD
      expect(pool0balBefore.sub(pool0balAfter)).to.be.gt(0);
      const adminFee = await curvePoolFactory.get_admin_balances(
        metaPool.address
      );

      // in the basepool we should be short the uAD amount transfered to the user + admin fees (50% of trade fee)
      // for exchanges the fee is taken in the output currency and calculated against the final amount received.
      expect(pool0balAfter).to.equal(
        pool0balBefore.sub(dy3CRVtouAD.add(adminFee[0]))
      );
      // whale account uAD Balance should be equal to the estimate swap amount
      const whaleUADBalanceAfterSwap = await uAD.balanceOf(curveWhaleAddress);
      console.log(`
      **-*-*-*-*-*--*whaleUADBalanceAfterSwap:${ethers.utils.formatEther(
        whaleUADBalanceAfterSwap
      )}
                                  dy3CRVtouAD:${ethers.utils.formatEther(
                                    dy3CRVtouAD
                                  )}
           `);
      expect(whaleUADBalanceAfterSwap).to.be.equal(
        whaleUADBalanceBeforeSwap.add(dy3CRVtouAD)
      );
      const whale3CRVBalanceAfterSwap = await crvToken.balanceOf(
        curveWhaleAddress
      );
      expect(whale3CRVBalanceAfterSwap).to.be.equal(
        whale3CRVBalanceBeforeSwap.sub(amountOf3CRVToSwap)
      );
      // pool0Blance should be less than before the swap
      expect(pool0balBefore.sub(pool0balAfter)).to.be.gt(0);
      // 3CRV balance in the pool should be equal to before + 1
      expect(balancesAfter[1].sub(balancesBefore[1])).to.equal(
        amountOf3CRVToSwap
      );
      // uAD balance in the pool should be less than before the swap
      expect(balancesBefore[0].sub(balancesAfter[0])).to.be.gt(0);

      // we should have positive fee in UAD
      expect(adminFee[0]).to.be.gt(0);

      await twapOracle.update();
      const oraclePriceuADAfter = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter).to.be.gt(ethers.utils.parseEther("1"));
      // if no swap after x block the price stays the same
      const LastBlockTimestamp = await metaPool.block_timestamp_last();
      const blockTimestamp = LastBlockTimestamp.toNumber() + 23 * 3600;
      await mineBlock(blockTimestamp);
      await twapOracle.update();
      const oraclePriceAfterMine = await twapOracle.consult(uAD.address);
      expect(oraclePriceuADAfter.sub(oraclePriceAfterMine)).to.equal(0);
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
      const dyuADto3CRV = await swapUADto3CRV(
        ethers.utils.parseEther("1"),
        secondAccount
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
      const dyuADtoDAI = await swapUADtoDAI(
        ethers.utils.parseEther("1"),
        secondAccount
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
      const dyuADtoDAI = await swapUADtoDAI(
        ethers.utils.parseEther("1"),
        secondAccount
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
      const dyuADto3CRV = await swapUADto3CRV(
        ethers.utils.parseEther("1"),
        secondAccount
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
    it("should return correct name", async () => {
      const name = await metaPool.name();
      expect(name).to.equal(
        "Curve.fi Factory USD Metapool: UbiquityAlgorithmicDollar"
      );
      const symbol = await metaPool.symbol();
      expect(symbol).to.equal("uAD3CRV-f");
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
    it("deposit liquidity with only uAD should decrease its price", async () => {
      const dyuAD2USDT = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 3, ethers.utils.parseEther("1"));
      expect(dyuAD2USDT).to.equal("1000678");
      const dyuAD2CRV = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );

      const uAD2ndBalbeforeAddLiquidity = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      const LP2ndBalbeforeAddLiquidity = await metaPool.balanceOf(
        await secondAccount.getAddress()
      );
      // secondAccount need to approve metaPool for sending its uAD
      await uAD
        .connect(secondAccount)
        .approve(metaPool.address, ethers.utils.parseEther("1"));

      const dyuAD2LP = await metaPool["calc_token_amount(uint256[2],bool)"](
        [ethers.utils.parseEther("1"), 0],
        true
      );
      await metaPool
        .connect(secondAccount)
        ["add_liquidity(uint256[2],uint256)"](
          [ethers.utils.parseEther("1"), 0],
          dyuAD2LP.mul(99).div(100)
        );
      const uAD2ndBalAfterAddLiquidity = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      const LP2ndBalAfterAddLiquidity = await metaPool.balanceOf(
        await secondAccount.getAddress()
      );

      expect(LP2ndBalAfterAddLiquidity).to.be.gt(LP2ndBalbeforeAddLiquidity);
      // it is less because calc_token_amount accounts for slippage, but not fees.
      // It should not be considered to be precise!
      expect(LP2ndBalAfterAddLiquidity).to.be.lt(
        LP2ndBalbeforeAddLiquidity.add(dyuAD2LP)
      );
      expect(uAD2ndBalAfterAddLiquidity).to.equal(
        uAD2ndBalbeforeAddLiquidity.sub(ethers.utils.parseEther("1"))
      );
      const dyuAD2USDTAfter = await metaPool[
        "get_dy_underlying(int128,int128,uint256)"
      ](0, 3, ethers.utils.parseEther("1"));
      expect(dyuAD2USDTAfter).to.be.lt(dyuAD2USDT);
      const dyuAD2CRVAfter = await metaPool["get_dy(int128,int128,uint256)"](
        0,
        1,
        ethers.utils.parseEther("1")
      );
      expect(dyuAD2CRVAfter).to.be.lt(dyuAD2CRV);
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
