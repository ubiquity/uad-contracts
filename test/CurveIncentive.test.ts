import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { DebtCouponManager } from "../artifacts/types/DebtCouponManager";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { CouponsForDollarsCalculator } from "../artifacts/types/CouponsForDollarsCalculator";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";
import { MockAutoRedeemToken } from "../artifacts/types/MockAutoRedeemToken";
import { ExcessDollarsDistributor } from "../artifacts/types/ExcessDollarsDistributor";
import { CurveUADIncentive } from "../artifacts/types/CurveUADIncentive";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";

import Big, { RoundingMode } from "big.js";
import { mineNBlock } from "./utils/hardhatNode";

describe("CurveIncentive", () => {
  let metaPool: IMetaPool;
  let couponsForDollarsCalculator: CouponsForDollarsCalculator;
  let manager: UbiquityAlgorithmicDollarManager;
  let debtCouponMgr: DebtCouponManager;
  let curveIncentive: CurveUADIncentive;
  let daiToken: ERC20;
  let twapOracle: TWAPOracle;
  let debtCoupon: DebtCoupon;
  let curvePoolFactory: ICurveFactory;
  let admin: Signer;
  let secondAccount: Signer;
  let operation: Signer;
  let treasury: Signer;
  let uGOVFund: Signer;
  let lpReward: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;
  let crvToken: ERC20;
  let DAI: string;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let daiWhaleAddress: string;
  let curveWhale: Signer;
  let dollarMintingCalculator: DollarMintingCalculator;
  let mockAutoRedeemToken: MockAutoRedeemToken;
  let excessDollarsDistributor: ExcessDollarsDistributor;
  const oneETH = ethers.utils.parseEther("1");

  const swapDAItoUAD = async (
    amount: BigNumber,
    signer: Signer
  ): Promise<BigNumber> => {
    const dyDAITouAD = await metaPool[
      "get_dy_underlying(int128,int128,uint256)"
    ](1, 0, amount);
    const expectedMinUAD = dyDAITouAD.div(100).mul(99);

    // secondAccount need to approve metaPool for sending its uAD
    await daiToken.connect(signer).approve(metaPool.address, amount);
    // swap 1 DAI  =>  1uAD
    await metaPool
      .connect(signer)
      ["exchange_underlying(int128,int128,uint256,uint256)"](
        1,
        0,
        amount,
        expectedMinUAD
      );
    return dyDAITouAD;
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
  const calculateIncentiveAmount = (
    amountInWEI: string,
    curPriceInWEI: string
  ): BigNumber => {
    // to have decent precision
    Big.DP = 35;
    // to avoid exponential notation
    Big.PE = 105;
    Big.NE = -35;
    // should be in ETH
    const one = new Big(ethers.utils.parseEther("1").toString());
    const amount = new Big(amountInWEI);
    // returns amount +  (1- TWAP_Price)%.
    console.log(`
    amount:${ethers.utils.formatEther(amountInWEI).toString()}
    curPriceInWEI:${ethers.utils.formatEther(curPriceInWEI).toString()}
    incentive:${one.sub(curPriceInWEI).mul(amount.div(one)).toString()}
    `);
    return BigNumber.from(
      one
        .sub(curPriceInWEI)
        .mul(amount.div(one))
        .round(0, RoundingMode.RoundDown)
        .toString()
    );
  };

  const couponLengthBlocks = 100;
  beforeEach(async () => {
    // list of accounts
    ({
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      DAI,
      curveWhaleAddress,
      daiWhaleAddress,
    } = await getNamedAccounts());
    [
      admin,
      secondAccount,
      operation,
      treasury,
      uGOVFund,
      lpReward,
    ] = await ethers.getSigners();

    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setuADTokenAddress(uAD.address);

    // set extra token
    crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;
    daiToken = (await ethers.getContractAt("ERC20", DAI)) as ERC20;
    // to deploy the stableswap pool we need 3CRV and uAD
    // kindly ask a whale to give us some 3CRV
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));
    // just mint som uAD
    // mint 10000 uAD each for admin, manager and secondAccount
    const mintings = [
      await operation.getAddress(),
      await secondAccount.getAddress(),
      manager.address,
    ].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    console.log(
      `CurveFactory:${curveFactory}

         curve3CrvBasePool: ${curve3CrvBasePool}
         crvToken:${crvToken.address}`
    );
    await manager.deployStableSwapPool(
      curveFactory,
      curve3CrvBasePool,
      crvToken.address,
      10,
      4000000
    );
    // setup the oracle
    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;
    console.log(
      `
         crvToken:${metaPoolAddr}`
    );
    const TWAPOracleFactory = await ethers.getContractFactory("TWAPOracle");
    twapOracle = (await TWAPOracleFactory.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;

    await manager.setTwapOracleAddress(twapOracle.address);

    // set uGOV
    const uGOVFactory = await ethers.getContractFactory("UbiquityGovernance");
    uGOV = (await uGOVFactory.deploy(manager.address)) as UbiquityGovernance;

    await manager.setuGOVTokenAddress(uGOV.address);

    // set coupon for dollar Calculator
    const couponsForDollarsCalculatorFactory = await ethers.getContractFactory(
      "CouponsForDollarsCalculator"
    );
    couponsForDollarsCalculator = (await couponsForDollarsCalculatorFactory.deploy(
      manager.address
    )) as CouponsForDollarsCalculator;

    await manager.setCouponCalculatorAddress(
      couponsForDollarsCalculator.address
    );
    // set Dollar Minting Calculator
    const dollarMintingCalculatorFactory = await ethers.getContractFactory(
      "DollarMintingCalculator"
    );
    dollarMintingCalculator = (await dollarMintingCalculatorFactory.deploy(
      manager.address
    )) as DollarMintingCalculator;
    await manager.setDollarCalculatorAddress(dollarMintingCalculator.address);

    // set debt coupon token
    const dcManagerFactory = await ethers.getContractFactory(
      "DebtCouponManager"
    );
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      manager.address
    )) as DebtCoupon;

    await manager.setDebtCouponAddress(debtCoupon.address);
    debtCouponMgr = (await dcManagerFactory.deploy(
      manager.address,
      couponLengthBlocks
    )) as DebtCouponManager;

    // debtCouponMgr should have the COUPON_MANAGER role to mint debtCoupon
    const COUPON_MANAGER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("COUPON_MANAGER")
    );
    // debtCouponMgr should have the UBQ_MINTER_ROLE to mint uAD for debtCoupon Redeem
    const UBQ_MINTER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
    );
    // debtCouponMgr should have the UBQ_BURNER_ROLE to burn uAD when minting debtCoupon
    const UBQ_BURNER_ROLE = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("UBQ_BURNER_ROLE")
    );
    await manager.grantRole(COUPON_MANAGER_ROLE, debtCouponMgr.address);
    await manager.grantRole(UBQ_MINTER_ROLE, debtCouponMgr.address);
    await manager.grantRole(UBQ_BURNER_ROLE, debtCouponMgr.address);

    // Incentive
    const incentiveFactory = await ethers.getContractFactory(
      "CurveUADIncentive"
    );
    curveIncentive = (await incentiveFactory.deploy(
      manager.address
    )) as CurveUADIncentive;
    // curveIncentive should have the UBQ_BURNER_ROLE to burn uAD during incentive
    await manager.grantRole(UBQ_BURNER_ROLE, curveIncentive.address);

    // curveIncentive should have the UBQ_MINTER_ROLE to mint uGOV during incentive
    await manager.grantRole(UBQ_MINTER_ROLE, curveIncentive.address);
    // set the incentive contract to act upon transfer from and to the curve pool
    await manager.setIncentiveToUAD(metaPool.address, curveIncentive.address);
    // turn off  Sell Penalty
    await curveIncentive.switchSellPenalty();
    // turn off  buy incentive Penalty
    await curveIncentive.switchBuyIncentive();
    // to calculate the totalOutstanding debt we need to take into account autoRedeemToken.totalSupply
    const mockAutoRedeemTokenFactory = await ethers.getContractFactory(
      "MockAutoRedeemToken"
    );
    mockAutoRedeemToken = (await mockAutoRedeemTokenFactory.deploy(
      0
    )) as MockAutoRedeemToken;

    await manager.setAutoRedeemPoolTokenAddress(mockAutoRedeemToken.address);

    // when the debtManager mint uAD it there is too much it distribute the excess to
    // ????TODO
    const excessDollarsDistributorFactory = await ethers.getContractFactory(
      "ExcessDollarsDistributor"
    );
    excessDollarsDistributor = (await excessDollarsDistributorFactory.deploy(
      manager.address
    )) as ExcessDollarsDistributor;

    await manager.setExcessDollarsDistributor(
      debtCouponMgr.address,
      excessDollarsDistributor.address
    );

    // set treasury,uGOVFund and lpReward address needed for excessDollarsDistributor
    await manager.setTreasuryAddress(await treasury.getAddress());
    await manager.setuGovFundAddress(await uGOVFund.getAddress());
    await manager.setLpRewardsAddress(await lpReward.getAddress());

    curvePoolFactory = (await ethers.getContractAt(
      "ICurveFactory",
      curveFactory
    )) as ICurveFactory;
  });

  it("Curve sell Incentive should be call when swapping uAD for 3CRV or underlying when uAD <1$", async () => {
    // turn on BuyIncentive
    await curveIncentive.switchSellPenalty();
    const secondAccountAdr = await secondAccount.getAddress();

    const priceBefores = await twapOracle.consult(uAD.address);
    console.log(`
    ----- priceBefores:${ethers.utils.formatEther(priceBefores)}
    `);

    // Now that the price is under peg we sell uAD and Check that the incentive is applied
    const priceBefore = await twapOracle.consult(uAD.address);
    expect(priceBefore).to.equal(oneETH);
    const balanceLPBefore = await metaPool.balanceOf(secondAccountAdr);
    const balance3CRVBefore = await crvToken.balanceOf(secondAccountAdr);
    const balanceUADBefore = await uAD.balanceOf(secondAccountAdr);
    const pool0balBefore = await metaPool.balances(0);
    const pool1balBefore = await metaPool.balances(1);
    // expect(pool0balBefore).to.equal(ethers.utils.parseEther("12000"));
    //  expect(pool1balBefore).to.equal(ethers.utils.parseEther("10000"));
    const metaPoolBalanceUADBefore = await uAD.balanceOf(metaPool.address);

    const amountToBeSwapped = await swapUADto3CRV(
      ethers.utils.parseEther("1000"),
      secondAccount
    );
    const pool0balAfter = await metaPool.balances(0);
    const pool1balAfter = await metaPool.balances(1);
    const priceAfter = await twapOracle.consult(uAD.address);
    expect(priceAfter).to.be.lt(priceBefore);
    const balanceLPAfter = await metaPool.balanceOf(secondAccountAdr);
    const balance3CRVAfter = await crvToken.balanceOf(secondAccountAdr);
    const balanceUADAfter = await uAD.balanceOf(secondAccountAdr);
    const metaPoolBalanceUADAfter = await uAD.balanceOf(metaPool.address);
    const penalty = calculateIncentiveAmount(
      "1000",
      ethers.utils.formatEther(priceBefore)
    );
    console.log(`
    metaPoolBalanceUADBefore:${ethers.utils.formatEther(
      metaPoolBalanceUADBefore
    )}
    metaPoolBalanceUADAfter:${ethers.utils.formatEther(metaPoolBalanceUADAfter)}
    pool0balBefore:${ethers.utils.formatEther(pool0balBefore)}
    pool1balBefore:${ethers.utils.formatEther(pool1balBefore)}
    pool0balAfter:${ethers.utils.formatEther(pool0balAfter)}
    pool1balAfter:${ethers.utils.formatEther(pool1balAfter)}
    amountToBeSwapped:${ethers.utils.formatEther(amountToBeSwapped)}
    priceBefore:${ethers.utils.formatEther(priceBefore)}
    priceAfter:${ethers.utils.formatEther(priceAfter)}
    penalty:${ethers.utils.formatEther(penalty)}
    balanceUADBefore:${ethers.utils.formatEther(balanceUADBefore)}
    balanceUADAfter:${ethers.utils.formatEther(balanceUADAfter)}
    balanceLPBefore:${ethers.utils.formatEther(balanceLPBefore)}
    balanceLPAfter:${ethers.utils.formatEther(balanceLPAfter)}
    balance3CRVBefore:${ethers.utils.formatEther(balance3CRVBefore)}
    balance3CRVAfter:${ethers.utils.formatEther(balance3CRVAfter)}
    `);
    // we have lost all the uAD
    expect(balanceUADBefore.sub(ethers.utils.parseEther("1000"))).to.equal(
      balanceUADAfter
    );
    expect(balanceLPBefore).to.equal(balanceLPAfter);
    //
    expect(balance3CRVBefore.add(amountToBeSwapped)).to.equal(balance3CRVAfter);
  });
  it("curve buy Incentive should be call when swapping  3CRV for uAD  when uAD <1$", async () => {
    // turn on  buy incentive Penalty
    await curveIncentive.switchBuyIncentive();
    const secondAccountAdr = await secondAccount.getAddress();
    // get some 3crv token from our beloved whale
    await crvToken
      .connect(curveWhale)
      .transfer(secondAccountAdr, ethers.utils.parseEther("1000"));
    const priceBefores = await twapOracle.consult(uAD.address);
    console.log(`
    ----- priceBefores:${ethers.utils.formatEther(priceBefores)}
    `);

    // Now that the price is under peg we sell uAD and Check that the incentive is applied
    const priceBefore = await twapOracle.consult(uAD.address);
    expect(priceBefore).to.equal(oneETH);
    const balanceLPBefore = await metaPool.balanceOf(secondAccountAdr);
    const balance3CRVBefore = await crvToken.balanceOf(secondAccountAdr);
    const balanceUADBefore = await uAD.balanceOf(secondAccountAdr);
    const balanceUgovBefore = await uGOV.balanceOf(secondAccountAdr);

    const metaPoolBalanceUADBefore = await uAD.balanceOf(metaPool.address);

    const amountToBeSwapped = await swap3CRVtoUAD(
      ethers.utils.parseEther("1000"),
      secondAccount
    );
    const pool0balAfter = await metaPool.balances(0);
    const pool1balAfter = await metaPool.balances(1);

    const priceAfter = await twapOracle.consult(uAD.address);
    expect(priceAfter).to.be.lt(priceBefore);
    const balanceLPAfter = await metaPool.balanceOf(secondAccountAdr);
    const balance3CRVAfter = await crvToken.balanceOf(secondAccountAdr);
    const balanceUgovAfter = await uGOV.balanceOf(secondAccountAdr);
    const balanceUADAfter = await uAD.balanceOf(secondAccountAdr);
    const metaPoolBalanceUADAfter = await uAD.balanceOf(metaPool.address);

    console.log(`
    balanceUgovBefore:${ethers.utils.formatEther(balanceUgovBefore)}
    balanceUgovAfter:${ethers.utils.formatEther(balanceUgovAfter)}
    metaPoolBalanceUADBefore:${ethers.utils.formatEther(
      metaPoolBalanceUADBefore
    )}
    metaPoolBalanceUADAfter:${ethers.utils.formatEther(metaPoolBalanceUADAfter)}
    pool0balAfter:${ethers.utils.formatEther(pool0balAfter)}
    pool1balAfter:${ethers.utils.formatEther(pool1balAfter)}
    amountToBeSwapped:${ethers.utils.formatEther(amountToBeSwapped)}
    priceBefore:${ethers.utils.formatEther(priceBefore)}
    priceAfter:${ethers.utils.formatEther(priceAfter)}

    balanceUADBefore:${ethers.utils.formatEther(balanceUADBefore)}
    balanceUADAfter:${ethers.utils.formatEther(balanceUADAfter)}
    balanceLPBefore:${ethers.utils.formatEther(balanceLPBefore)}
    balanceLPAfter:${ethers.utils.formatEther(balanceLPAfter)}
    balance3CRVBefore:${ethers.utils.formatEther(balance3CRVBefore)}
    balance3CRVAfter:${ethers.utils.formatEther(balance3CRVAfter)}
    maxuint:${ethers.constants.MaxUint256}
    `);
    const incentive = calculateIncentiveAmount(
      amountToBeSwapped.toString(),
      priceAfter.toString()
    );

    console.log(` penalty:${ethers.utils.formatEther(incentive)} `);
    // we minted the right wmount of uGOV
    expect(balanceUgovBefore.add(incentive)).to.equal(balanceUgovAfter);
    // we have lost all the uAD
    expect(balanceUADBefore.add(amountToBeSwapped)).to.equal(balanceUADAfter);
    expect(balanceLPBefore).to.equal(balanceLPAfter);
    //
    expect(balance3CRVBefore.sub(ethers.utils.parseEther("1000"))).to.equal(
      balance3CRVAfter
    );
  });
  it.only("curve buy Incentive should be call when swapping  underlying for uAD when uAD <1$", async () => {
    // turn on  buy incentive Penalty
    await curveIncentive.switchBuyIncentive();
    const secondAccountAdr = await secondAccount.getAddress();
    const amount = ethers.utils.parseEther("0.45678");
    // get some dai token from our beloved whale
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [daiWhaleAddress],
    });
    const daiWhale = ethers.provider.getSigner(daiWhaleAddress);
    const bal = await daiToken.balanceOf(daiWhaleAddress);
    console.log(`
    ----- bal:${ethers.utils.formatEther(bal)}
    `);
    await daiToken.connect(daiWhale).transfer(secondAccountAdr, amount);
    const priceBefores = await twapOracle.consult(uAD.address);
    console.log(`
    ----- priceBefores:${ethers.utils.formatEther(priceBefores)}
    `);

    // Now that the price is under peg we sell uAD and Check that the incentive is applied
    const priceBefore = await twapOracle.consult(uAD.address);
    expect(priceBefore).to.equal(oneETH);
    const balanceLPBefore = await metaPool.balanceOf(secondAccountAdr);
    const balanceDAIBefore = await daiToken.balanceOf(secondAccountAdr);
    const balanceUADBefore = await uAD.balanceOf(secondAccountAdr);
    const balanceUgovBefore = await uGOV.balanceOf(secondAccountAdr);

    const metaPoolBalanceUADBefore = await uAD.balanceOf(metaPool.address);

    const amountToBeSwapped = await swapDAItoUAD(amount, secondAccount);
    const pool0balAfter = await metaPool.balances(0);
    const pool1balAfter = await metaPool.balances(1);

    const priceAfter = await twapOracle.consult(uAD.address);
    expect(priceAfter).to.be.lt(priceBefore);
    const balanceLPAfter = await metaPool.balanceOf(secondAccountAdr);
    const balanceDAIAfter = await daiToken.balanceOf(secondAccountAdr);
    const balanceUgovAfter = await uGOV.balanceOf(secondAccountAdr);
    const balanceUADAfter = await uAD.balanceOf(secondAccountAdr);
    const metaPoolBalanceUADAfter = await uAD.balanceOf(metaPool.address);
    const adminFee = await curvePoolFactory.get_admin_balances(
      metaPool.address
    );
    const rates = await curvePoolFactory.get_rates(metaPool.address);

    console.log(`
    ---rates0:${ethers.utils.formatEther(rates[0])}
    ---rates1:${ethers.utils.formatEther(rates[1])}
    ---adminFee0:${ethers.utils.formatEther(adminFee[0])}
    ---adminFee1:${ethers.utils.formatEther(adminFee[1])}
    balanceUgovBefore:${ethers.utils.formatEther(balanceUgovBefore)}
    balanceUgovAfter:${ethers.utils.formatEther(balanceUgovAfter)}
    metaPoolBalanceUADBefore:${ethers.utils.formatEther(
      metaPoolBalanceUADBefore
    )}
    metaPoolBalanceUADAfter:${ethers.utils.formatEther(metaPoolBalanceUADAfter)}
    pool0balAfter:${ethers.utils.formatEther(pool0balAfter)}
    pool1balAfter:${ethers.utils.formatEther(pool1balAfter)}
    amountToBeSwapped:${ethers.utils.formatEther(amountToBeSwapped)}
    priceBefore:${ethers.utils.formatEther(priceBefore)}
    priceAfter:${ethers.utils.formatEther(priceAfter)}

    balanceUADBefore:${ethers.utils.formatEther(balanceUADBefore)}
    balanceUADAfter:${ethers.utils.formatEther(balanceUADAfter)}
    balanceLPBefore:${ethers.utils.formatEther(balanceLPBefore)}
    balanceLPAfter:${ethers.utils.formatEther(balanceLPAfter)}
    balanceDAIBefore:${ethers.utils.formatEther(balanceDAIBefore)}
    balanceDAIAfter:${ethers.utils.formatEther(balanceDAIAfter)}
    maxuint:${ethers.constants.MaxUint256}
    `);
    const incentive = calculateIncentiveAmount(
      amountToBeSwapped.toString(),
      priceAfter.toString()
    );

    console.log(` incentive:${ethers.utils.formatEther(incentive)} `);
    // we minted the right amount of uGOV
    // when swapping for underlying token the exchange_underlying is not precise
    const expectedUgov = balanceUgovBefore.add(incentive);
    expect(balanceUgovAfter).to.be.lt(expectedUgov);
    expect(balanceUgovAfter).to.be.gt(expectedUgov.mul(9999).div(10000));
    // we have lost all the uAD
    const expectedUAD = balanceUADBefore.add(amountToBeSwapped);
    expect(balanceUADAfter).to.be.lt(expectedUAD);
    expect(balanceUADAfter).to.be.gt(expectedUAD.mul(9999).div(10000));
    expect(balanceLPBefore).to.equal(balanceLPAfter);
    //
    expect(balanceDAIBefore.sub(amount)).to.equal(balanceDAIAfter);
  });
  // todo ugov incetive
  // todo emit event set incentive
  // todo exempt address
  // update incetive contract
});
