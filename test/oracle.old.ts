import { BigNumber, ContractTransaction, Signer } from "ethers";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { before, describe, it } from "mocha";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { expect } from "./setup";
import { mineBlock } from "./utils/hardhatNode";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { BondingShare } from "../artifacts/types/BondingShare";
import { Bonding } from "../artifacts/types/Bonding";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";

describe("Bonding", () => {
  let bonding: Bonding;
  let metaPool: IMetaPool;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let sablier: string;
  let DAI: string;
  let USDC: string;
  let USDT: string;
  let curvePoolFactory: ICurveFactory;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;

  before(async () => {
    ({
      sablier,
      DAI,
      USDC,
      USDT,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();

    const BondingShareDeployment = await deployments.deploy("BondingShare", {
      from: await admin.getAddress(),
    });

    bondingShare = (await ethers.getContractAt(
      "BondingShare",
      BondingShareDeployment.address
    )) as BondingShare;

    const Manager = await deployments.deploy(
      "UbiquityAlgorithmicDollarManager",
      {
        from: await admin.getAddress(),
        args: [await admin.getAddress()],
      }
    );
    // manager = new ethers.Contract(Manager.address, Manager.abi, provider);
    manager = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollarManager",
      Manager.address
    )) as UbiquityAlgorithmicDollarManager;

    await manager.connect(admin).setBondingShareAddress(bondingShare.address);

    const UAD = await deployments.deploy("UbiquityAlgorithmicDollar", {
      from: await admin.getAddress(),
    });

    uAD = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollar",
      UAD.address
    )) as UbiquityAlgorithmicDollar;

    // mint 10000 uAD each for admin and secondAccount
    const mintings = [admin, secondAccount].map(
      async (signer): Promise<ContractTransaction> =>
        uAD
          .connect(admin)
          .mint(await signer.getAddress(), ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    await uAD
      .connect(admin)
      .mint(manager.address, ethers.utils.parseEther("10000"));

    await manager.connect(admin).setuADTokenAddress(uAD.address);

    const crvToken = (await ethers.getContractAt(
      "ERC20",
      curve3CrvToken
    )) as ERC20;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });

    const curveWhale = ethers.provider.getSigner(curveWhaleAddress);

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
    console.log(`METAPOOL :${metaPoolAddr}`);
    const TWAPOracleDeployment = await deployments.deploy("TWAPOracle", {
      from: await admin.getAddress(),
      args: [metaPoolAddr, curve3CrvToken, uAD.address],
    });

    twapOracle = (await ethers.getContractAt(
      "TWAPOracle",
      TWAPOracleDeployment.address
    )) as TWAPOracle;

    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);
    await twapOracle.connect(secondAccount).update();

    curvePoolFactory = (await ethers.getContractAt(
      "ICurveFactory",
      curveFactory
    )) as ICurveFactory;
    // Get the number of coins and underlying coins within a pool.
    const nCoins = await curvePoolFactory.get_n_coins(metaPoolAddr);
    console.log(
      `nCoins0:${nCoins[0].toString()} nCoins1:${nCoins[1].toString()}`
    );
    // Get a list of the swappable coins within a pool.
    const coins = await curvePoolFactory.get_coins(metaPoolAddr);
    console.log(`uAD.address:${uAD.address}`);
    console.log(`curve3CrvToken:${curve3CrvToken}`);
    console.log(`curve3CrvBasePool:${curve3CrvBasePool}`);
    console.log(`coins0:${coins[0].toString()} coins1:${coins[1].toString()}`);
    // Get a list of the swappable underlying coins within a pool.
    const underCoins = await curvePoolFactory.get_underlying_coins(
      metaPoolAddr
    );
    console.log(
      `underlying Coins:${underCoins.map(
        (c, i) => `id:${i} coin:${c.toString()}`
      ).join(`
        `)} `
    );

    // Get a list of decimal places for each coin within a pool.
    const decimalCoins = await curvePoolFactory.get_underlying_decimals(
      metaPoolAddr
    );
    console.log(
      `decimalCoins: ${decimalCoins.map(
        (c, i) => `coinId:${i} decimal:${c.toString()}`
      ).join(`
        `)} `
    );

    // Convert coin addresses into indices for use with pool methods.
    const indices = await curvePoolFactory.get_coin_indices(
      metaPoolAddr,
      DAI,
      USDT
    );
    console.log(`indices: underlying coins?${indices[2] ? "true" : "false"}
     index of DAI:${indices[0].toString()}
     index of USDT:${indices[1].toString()}
     `);

    // Get available balances for each coin within a pool.
    const balances = await curvePoolFactory.get_underlying_balances(
      metaPoolAddr
    );
    console.log(
      `balances: ${balances.map(
        (c, i) => `coinId:${i} balances:${c.toString()}`
      ).join(`
        `)} `
    );

    // Get the exchange rates between coins and underlying coins within a pool, normalized to a 1e18 precision.
    const rates = await curvePoolFactory.get_rates(metaPoolAddr);
    console.log(
      `rates: ${rates.map((c, i) => `Id:${i} rates:${c.toString()}`).join(`
            `)} `
    );

    // Getter for the pool balances array.
    const pool0bal = await metaPool.balances(0);
    const pool1bal = await metaPool.balances(1);
    console.log(
      `pool0bal: ${pool0bal.toString()} pool1bal: ${pool1bal.toString()} `
    );

    // Getter virtual price.
    const virtPrice = await metaPool.get_virtual_price();
    console.log(`virtPrice: ${virtPrice.toString()} `);

    // Get the amount received (“dy”) when performing a swap between two assets within the pool.

    const dyuAD2USDT = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](0, 3, ethers.utils.parseEther("1"));
    console.log(`dyuAD2USDT: ${dyuAD2USDT.toString()} `);
    const dyDAI2USDT = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](1, 3, ethers.utils.parseEther("1"));
    console.log(` dyDAI2USDT: ${dyDAI2USDT.toString()} `);
    const dyuAD2DAI = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](0, 1, ethers.utils.parseEther("1"));
    console.log(` dyuAD2DAI: ${dyuAD2DAI.toString()} `);
    const expectedMinDai = dyuAD2DAI.div(100).mul(99);
    console.log(`expectedMin dyuAD2DAI: ${expectedMinDai.toString()} `);
    // Performs an exchange between two tokens.
    const uADAdminBalbeforeSWAP = await uAD.balanceOf(await admin.getAddress());
    const uAD2ndBalbeforeSWAP = await uAD.balanceOf(
      await secondAccount.getAddress()
    );
    console.log(
      `uADAdminBalbeforeSWAP: ${ethers.utils.formatEther(
        uADAdminBalbeforeSWAP.toString()
      )}  uAD2ndBalbeforeSWAP: ${ethers.utils.formatEther(
        uAD2ndBalbeforeSWAP.toString()
      )} `
    );

    // Exchange (swap)
    const dyuAD23CRV = await metaPool["get_dy(int128,int128,uint256)"](
      0,
      1,
      ethers.utils.parseEther("1")
    );
    const expectedMin3CRV = dyuAD23CRV.div(100).mul(99);
    console.log(`expectedMin3CRV : ${expectedMin3CRV.toString()} `);
    // secondAccount need to approve metaPool for sending its uAD
    await uAD
      .connect(secondAccount)
      .approve(metaPoolAddr, ethers.utils.parseEther("1"));
    // secondAccount swap 1uAD to 1 3CRV
    let LastBlockTimestamp = await metaPool.block_timestamp_last();
    console.log(`LastBlockTimestamp: ${LastBlockTimestamp.toString()} `);
    let prices = await metaPool.get_price_cumulative_last();
    console.log(
      `1st prices0:${ethers.utils.formatEther(
        prices[0]
      )} prices1:${ethers.utils.formatEther(prices[1])}`
    );
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
    console.log(
      `secondAccountuADBalance: ${ethers.utils.formatEther(
        secondAccountuADBalance.toString()
      )}  secondAccount3CRVBalance: ${ethers.utils.formatEther(
        secondAccount3CRVBalance.toString()
      )} `
    );
    // admin need to approve metaPool for sending its uAD
    await uAD.approve(metaPoolAddr, ethers.utils.parseEther("1"));
    LastBlockTimestamp = await metaPool.block_timestamp_last();
    console.log(`LastBlockTimestamp: ${LastBlockTimestamp.toString()} `);
    prices = await metaPool.get_price_cumulative_last();
    console.log(
      `2nd prices0:${ethers.utils.formatEther(
        prices[0]
      )} prices1:${ethers.utils.formatEther(prices[1])}`
    );
    // admin swap 1uAD to 1 dai
    await metaPool["exchange_underlying(int128,int128,uint256,uint256)"](
      0,
      1,
      ethers.utils.parseEther("1"),
      expectedMinDai
    );

    const daiToken = (await ethers.getContractAt("ERC20", DAI)) as ERC20;
    const admuADBalance = await uAD.balanceOf(await admin.getAddress());
    const admDAIBalance = await daiToken.balanceOf(await admin.getAddress());
    console.log(
      `admuADBalance: ${ethers.utils.formatEther(
        admuADBalance.toString()
      )}  admDAIBalance: ${ethers.utils.formatEther(admDAIBalance.toString())} `
    );

    // Getter for the pool balances array.
    const apool0bal = await metaPool.balances(0);
    const apool1bal = await metaPool.balances(1);
    console.log(
      `pool0bal: ${apool0bal.toString()} pool1bal: ${apool1bal.toString()} `
    );

    // Getter virtual price.
    const avirtPrice = await metaPool.get_virtual_price();
    console.log(`virtPrice: ${avirtPrice.toString()} `);
    /*  console.log(
      `exchange uAD for DAI amount of DAI received for 1 uAD: ${ethers.utils.formatUnits(
        exuAD2DAI,
        "wei"
      )} `
    ); */
    /** *
     *
     *
     *
     */
    LastBlockTimestamp = await metaPool.block_timestamp_last();
    console.log(`LastBlockTimestamp: ${LastBlockTimestamp.toString()} `);
    prices = await metaPool.get_price_cumulative_last();
    console.log(
      `3rd prices0:${ethers.utils.formatEther(
        prices[0]
      )} prices1:${ethers.utils.formatEther(prices[1])}`
    );
    const blockTimestamp = LastBlockTimestamp.toNumber() + 23 * 3600;
    await mineBlock(blockTimestamp);
    LastBlockTimestamp = await metaPool.block_timestamp_last();
    const lastBlock = await ethers.provider.getBlock(
      await ethers.provider.getBlockNumber()
    );
    console.log(
      `LastBlockTimestamp: ${LastBlockTimestamp.toString()} lastBlock.Timestamp: ${lastBlock.timestamp.toString()} `
    );
    prices = await metaPool.get_price_cumulative_last();
    console.log(
      `4rd prices0:${ethers.utils.formatEther(
        prices[0]
      )} prices1:${ethers.utils.formatEther(prices[1])}`
    );
    /*  blockTimestamp =
      (await twapOracle.reservesBlockTimestampLast()) + 23 * 3600;
    await mineBlock(blockTimestamp);
    await twapOracle.connect(secondAccount).update(); */

    await twapOracle.connect(secondAccount).update();

    // await mineBlock(blockTimestamp);
    // await twapOracle.connect(secondAccount).update();

    const oraclePriceuAD = await twapOracle.consult(uAD.address);
    const oraclePrice3Crv = await twapOracle.consult(curve3CrvToken);
    console.log(
      `TWAP PRICES
      oraclePriceuAD:${ethers.utils.formatEther(oraclePriceuAD)}
      oraclePrice3Crv:${ethers.utils.formatEther(oraclePrice3Crv)}`
    );
    /*
    let blockTimestamp =
      (await twapOracle.reservesBlockTimestampLast()) + 23 * 3600;
    await mineBlock(blockTimestamp);
    await twapOracle.connect(secondAccount).update();

    blockTimestamp =
      (await twapOracle.reservesBlockTimestampLast()) + 23 * 3600;
    await mineBlock(blockTimestamp);
    await twapOracle.connect(secondAccount).update(); */

    const BondingDeployment = await deployments.deploy("Bonding", {
      from: await admin.getAddress(),
      args: [manager.address, sablier],
    });

    bonding = (await ethers.getContractAt(
      "Bonding",
      BondingDeployment.address
    )) as Bonding;

    await bondingShare
      .connect(admin)
      .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);
  });

  describe("CollectableDust", () => {
    it("Admin should be able to add protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).addProtocolToken(USDC);
    });

    it("Should revert when another account tries to add protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).addProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should revert when trying to add an already existing protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).addProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-is-part-of-the-protocol");
    });

    it("Should revert when another account tries to remove a protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).removeProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Admin should be able to remove protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).removeProtocolToken(USDC);
    });

    it("Should revert when trying to remove token that is not a part of the protocol (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).removeProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-not-part-of-the-protocol");
    });

    it("Admin should be able to send dust from the contract (CollectableDust)", async () => {
      // Send ETH to the Bonding contract
      await secondAccount.sendTransaction({
        to: bonding.address,
        value: ethers.utils.parseUnits("100", "gwei"),
      });

      // Send dust back to the admin
      await bonding
        .connect(admin)
        .sendDust(
          await admin.getAddress(),
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });

    it("Should emit DustSent event (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(admin)
          .sendDust(
            await admin.getAddress(),
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("50", "gwei")
          )
      )
        .to.emit(bonding, "DustSent")
        .withArgs(
          await admin.getAddress(),
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });
    it("Should revert when another account tries to remove dust from the contract (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .sendDust(
            await admin.getAddress(),
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("100", "gwei")
          )
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit ProtocolTokenAdded event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).addProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenAdded")
        .withArgs(DAI);
    });

    it("Should emit ProtocolTokenRemoved event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).removeProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenRemoved")
        .withArgs(DAI);
    });
  });

  describe("maxBondingPrice", () => {
    it("Admin should be able to update the maxBondingPrice", async () => {
      await bonding
        .connect(admin)
        .setMaxBondingPrice(ethers.constants.MaxUint256);
      expect(await bonding.maxBondingPrice()).to.equal(
        ethers.constants.MaxUint256
      );
    });

    it("Should revert when unauthorized accounts try to update the maxBondingPrice", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setMaxBondingPrice(ethers.constants.MaxUint256)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the MaxBondingPriceUpdated event", async () => {
      await expect(
        bonding.connect(admin).setMaxBondingPrice(ethers.constants.MaxUint256)
      )
        .to.emit(bonding, "MaxBondingPriceUpdated")
        .withArgs(ethers.constants.MaxUint256);
    });
  });

  describe("bondingDiscountMultiplier", () => {
    it("Admin should be able to update the bondingDiscountMultiplier", async () => {
      await bonding
        .connect(admin)
        .setBondingDiscountMultiplier(ethers.BigNumber.from(2));
      expect(await bonding.bondingDiscountMultiplier()).to.equal(
        ethers.BigNumber.from(2)
      );
    });

    it("Should revert when unauthorized accounts try to update the bondingDiscountMultiplier", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the BondingDiscountMultiplierUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      )
        .to.emit(bonding, "BondingDiscountMultiplierUpdated")
        .withArgs(ethers.BigNumber.from(2));
    });
  });

  describe("redeemStreamTime", () => {
    it("Admin should be able to update the redeemStreamTime", async () => {
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      expect(await bonding.redeemStreamTime()).to.equal(
        ethers.BigNumber.from("0")
      );
    });

    it("Should revert when unauthorized accounts try to update the redeemStreamTime", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setRedeemStreamTime(ethers.BigNumber.from(0))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the RedeemStreamTimeUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setRedeemStreamTime(ethers.BigNumber.from("604800"))
      )
        .to.emit(bonding, "RedeemStreamTimeUpdated")
        .withArgs(ethers.BigNumber.from("604800"));
    });
  });

  describe("StableSwap meta pool TWAP oracle", () => {
    it.only("Oracle should return the correct initial price", async () => {
      expect(await twapOracle.consult(uAD.address)).to.equal(
        ethers.utils.parseEther("1")
      );
    });
    /*   it.only("Oracle should return the correct initial price", async () => {
      const prices = await metaPool.get_price_cumulative_last();
      console.log(
        `log prices0:${prices[0].toString()} prices1:${prices[1].toString()}`
      );
      expect(prices[0]).to.equal(ethers.utils.parseEther("1"));
    }); */
  });

  describe("bondTokens", () => {
    it("User should be able to bond uAD tokens", async () => {
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress()
      );
      const amountToBond = ethers.utils.parseEther("5000");

      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      await bonding.connect(secondAccount).bondTokens(amountToBond);

      const newBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress()
      );
      expect(newBondingSharesBalance).to.be.gt(prevBondingSharesBalance);
    });
  });

  describe("redeemShares", () => {
    it("Should revert when users try to redeem more shares than they have", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .redeemShares(ethers.utils.parseEther("10000"))
      ).to.be.revertedWith("Bonding: Caller does not have enough shares");
    });

    it("Users should be able to instantaneously redeem shares when the redeemStreamTime is 0", async () => {
      const initialRedeemStreamTime = await bonding.redeemStreamTime();
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      const prevUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress()
      );
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, prevBondingSharesBalance);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      const newUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      const newBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress()
      );

      expect(prevUADBalance).to.be.lt(newUADBalance);

      expect(prevBondingSharesBalance).to.be.gt(newBondingSharesBalance);

      await bonding.connect(admin).setRedeemStreamTime(initialRedeemStreamTime);
    });

    it("Users should be able to start Sablier streams to redeem their shares", async () => {
      const prevUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      const amountToBond = ethers.utils.parseEther("5000");
      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      await bonding.connect(secondAccount).bondTokens(amountToBond);

      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress()
      );

      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, prevBondingSharesBalance);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      expect(await uAD.balanceOf(await secondAccount.getAddress())).to.be.lt(
        prevUADBalance
      );

      expect(prevBondingSharesBalance).to.be.gt(
        await bondingShare.balanceOf(await secondAccount.getAddress())
      );
    });
  });

  describe("Sablier configuration", () => {
    it("Should return the current Sablier address", async () => {
      expect(await bonding.sablier()).to.equal(sablier);
    });

    it("admin should be able to update the Sablier address", async () => {
      await bonding.connect(admin).setSablier(ethers.constants.AddressZero);
      expect(await bonding.sablier()).to.equal(ethers.constants.AddressZero);
    });

    it("Should emit the SablierUpdated event", async () => {
      await expect(bonding.connect(admin).setSablier(DAI))
        .to.emit(bonding, "SablierUpdated")
        .withArgs(DAI);
    });

    it("Should revert when another account tries to update the Sablier address", async () => {
      await expect(
        bonding.connect(secondAccount).setSablier(ethers.constants.AddressZero)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });
  });
});
