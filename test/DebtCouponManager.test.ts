import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { Big, RoundingMode } from "big.js";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { DebtCouponManager } from "../artifacts/types/DebtCouponManager";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { CouponsForDollarsCalculator } from "../artifacts/types/CouponsForDollarsCalculator";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";
import { MockAutoRedeemToken } from "../artifacts/types/MockAutoRedeemToken";
import { ExcessDollarsDistributor } from "../artifacts/types/ExcessDollarsDistributor";

describe("DebtCouponManager", () => {
  let metaPool: IMetaPool;
  let couponsForDollarsCalculator: CouponsForDollarsCalculator;
  let manager: UbiquityAlgorithmicDollarManager;
  let debtCouponMgr: DebtCouponManager;
  let twapOracle: TWAPOracle;
  let debtCoupon: DebtCoupon;
  let admin: Signer;
  let secondAccount: Signer;
  let treasury: Signer;
  let uGOVFund: Signer;
  let lpReward: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let crvToken: ERC20;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let curveWhale: Signer;
  let dollarMintingCalculator: DollarMintingCalculator;
  let mockAutoRedeemToken: MockAutoRedeemToken;
  let excessDollarsDistributor: ExcessDollarsDistributor;
  const oneETH = ethers.utils.parseEther("1");
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
  const calcPercentage = (amount: string, percentage: string): BigNumber => {
    const value = new Big(amount);
    const one = new Big(ethers.utils.parseEther("1").toString());
    const percent = new Big(percentage).div(one);
    return BigNumber.from(
      value.mul(percent).round(0, RoundingMode.RoundDown).toString()
    );
  };
  const calcPremium = (
    amount: string,
    uADTotalSupply: string,
    totalDebt: string
  ): BigNumber => {
    const one = new Big(1);
    const uADTotSupply = new Big(uADTotalSupply);
    const TotDebt = new Big(totalDebt);
    const amountToPremium = new Big(amount);
    const prem = amountToPremium.mul(
      one.div(one.sub(TotDebt.div(uADTotSupply)).pow(2))
    );
    return BigNumber.from(prem.round(0, RoundingMode.RoundDown).toString());
  };
  const couponLengthBlocks = 100;
  beforeEach(async () => {
    // list of accounts
    ({
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [
      admin,
      secondAccount,
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
    await manager.connect(admin).setuADTokenAddress(uAD.address);

    // set twap Oracle Address
    crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;

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
    const mintings = [await secondAccount.getAddress(), manager.address].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.connect(admin).mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    await manager
      .connect(admin)
      .deployStableSwapPool(
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

    const TWAPOracleFactory = await ethers.getContractFactory("TWAPOracle");
    twapOracle = (await TWAPOracleFactory.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;

    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);
    // set coupon for dollar Calculator
    const couponsForDollarsCalculatorFactory = await ethers.getContractFactory(
      "CouponsForDollarsCalculator"
    );
    couponsForDollarsCalculator = (await couponsForDollarsCalculatorFactory.deploy(
      manager.address
    )) as CouponsForDollarsCalculator;

    await manager
      .connect(admin)
      .setCouponCalculatorAddress(couponsForDollarsCalculator.address);
    // set Dollar Minting Calculator
    const dollarMintingCalculatorFactory = await ethers.getContractFactory(
      "DollarMintingCalculator"
    );
    dollarMintingCalculator = (await dollarMintingCalculatorFactory.deploy(
      manager.address
    )) as DollarMintingCalculator;
    await manager
      .connect(admin)
      .setDollarCalculatorAddress(dollarMintingCalculator.address);

    // set debt coupon token
    const dcManagerFactory = await ethers.getContractFactory(
      "DebtCouponManager"
    );
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      manager.address
    )) as DebtCoupon;

    await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);
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
    await manager
      .connect(admin)
      .grantRole(COUPON_MANAGER_ROLE, debtCouponMgr.address);
    await manager
      .connect(admin)
      .grantRole(UBQ_MINTER_ROLE, debtCouponMgr.address);
    await manager
      .connect(admin)
      .grantRole(UBQ_BURNER_ROLE, debtCouponMgr.address);

    // to calculate the totalOutstanding debt we need to take into account autoRedeemToken.totalSupply
    const mockAutoRedeemTokenFactory = await ethers.getContractFactory(
      "MockAutoRedeemToken"
    );
    mockAutoRedeemToken = (await mockAutoRedeemTokenFactory.deploy(
      0
    )) as MockAutoRedeemToken;

    await manager
      .connect(admin)
      .setAutoRedeemPoolTokenAddress(mockAutoRedeemToken.address);

    // when the debtManager mint uAD it there is too much it distribute the excess to
    // ????TODO
    const excessDollarsDistributorFactory = await ethers.getContractFactory(
      "ExcessDollarsDistributor"
    );
    excessDollarsDistributor = (await excessDollarsDistributorFactory.deploy(
      manager.address
    )) as ExcessDollarsDistributor;

    await manager
      .connect(admin)
      .setExcessDollarsDistributor(
        debtCouponMgr.address,
        excessDollarsDistributor.address
      );

    // set treasury,uGOVFund and lpReward address needed for excessDollarsDistributor
    await manager
      .connect(admin)
      .setTreasuryAddress(await treasury.getAddress());
    await manager
      .connect(admin)
      .setuGovFundAddress(await uGOVFund.getAddress());
    await manager
      .connect(admin)
      .setLpRewardsAddress(await lpReward.getAddress());
  });
  describe("DebtCouponManager", () => {
    //  TODO add a test to make sure that calling  getDollarsToMint twice doesn't mint
    // dollars twice

    // TODO Only debCouponManager can mint
    // TODO TEST can't redeem all coupon
    // TODO TEST reset dollarsMintedThisCycle to zero when we mint debt coupon in a debt cycle
    // TODO TEST excess of minted uAD by the debtManager is distributed */
    it("exchangeDollarsForCoupons should fail if uAD price is >= 1", async () => {
      await expect(
        debtCouponMgr.connect(secondAccount).exchangeDollarsForCoupons(1)
      ).to.revertedWith("Price must be below 1 to mint coupons");
    });
    it("exchangeDollarsForCoupons should fail if coupon is expired or amount is insufficient", async () => {
      const pool0bal = await metaPool.balances(0);
      const pool1bal = await metaPool.balances(1);
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));

      // Price must be below 1 to mint coupons
      // remove liquidity one coin 3CRV only so that uAD will be worth less
      const admBalance = await metaPool.balanceOf(await admin.getAddress());

      // calculation to withdraw 1e18 LP token
      // Calculate the amount received when withdrawing and unwrapping in a single coin.
      // Useful for setting _max_burn_amount when calling remove_liquidity_one_coin.
      const lpTo3CRV = await metaPool["calc_withdraw_one_coin(uint256,int128)"](
        oneETH,
        1
      );

      const expected = lpTo3CRV.div(100).mul(99);
      // approve metapool to burn LP on behalf of admin
      await metaPool.approve(metaPool.address, admBalance);

      // Withdraw a single asset from the pool.
      await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
        oneETH,
        1,
        expected
      );

      await twapOracle.update();

      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);
      const amountToExchangeForCoupon = oneETH;
      const secondAccountAdr = await secondAccount.getAddress();
      const balanceBefore = await uAD.balanceOf(secondAccountAdr);

      // approve debtCouponManager to burn user's token
      /*   await uAD
        .connect(secondAccount)
        .approve(debtCouponMgr.address, amountToExchangeForCoupon); */
      const lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      const expiryBlock = lastBlock.number + 1 + couponLengthBlocks;

      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .exchangeDollarsForCoupons(amountToExchangeForCoupon)
      )
        .to.emit(debtCoupon, "MintedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, couponToMint);

      const balanceAfter = await uAD.balanceOf(secondAccountAdr);

      expect(
        balanceBefore.sub(balanceAfter).sub(amountToExchangeForCoupon)
      ).to.equal(0);
      // check that we have a debt coupon with correct premium
      const debtCoupons = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      expect(debtCoupons).to.equal(couponToMint);

      // check outstanding debt now
      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(debtCoupons);

      // Price must be above 1 to redeem coupon
      // we previously removed 3CRV from the pool meaning uAD is <1$ because
      // we have more uAD than 3CRV. In order to make uAD >1$ we will swap 3CRV
      // for uAD.
      // Note that we previously burnt uAD but as we get the price from curve the
      // uAD burnt didn't affect the price
      const whale3CRVBalanceBeforeSwap = await crvToken.balanceOf(
        curveWhaleAddress
      );
      const CRVAmountToSwap = ethers.utils.parseEther("1000");

      // Exchange (swap)
      let dy3CRVtouAD = await swap3CRVtoUAD(
        CRVAmountToSwap.sub(BigNumber.from(1)),
        curveWhale
      );
      await twapOracle.update();
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      dy3CRVtouAD = dy3CRVtouAD.add(BigNumber.from(1));
      await twapOracle.update();

      const whale3CRVBalance = await crvToken.balanceOf(curveWhaleAddress);
      const whaleuADBalance = await uAD.balanceOf(curveWhaleAddress);

      expect(whaleuADBalance).to.equal(dy3CRVtouAD);
      expect(whale3CRVBalance).to.equal(
        whale3CRVBalanceBeforeSwap.sub(CRVAmountToSwap)
      );

      await twapOracle.update();
      const uADPriceAfterSwap = await twapOracle.consult(uAD.address);

      expect(uADPriceAfterSwap).to.be.gt(oneETH);

      // should fail if not enough coupon
      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .redeemCoupons(expiryBlock, debtCoupons.mul(2))
      ).to.revertedWith("User doesnt have enough coupons");
      // should expire after couponLengthBlocks block
      const blockBefore = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      await mineNBlock(couponLengthBlocks);
      const blockAfter = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      expect(blockAfter.number).to.equal(
        blockBefore.number + couponLengthBlocks
      );
      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .redeemCoupons(expiryBlock, debtCoupons)
      ).to.revertedWith("Coupon has expired");
    });
    it("exchangeDollarsForCoupons should work", async () => {
      const pool0bal = await metaPool.balances(0);
      const pool1bal = await metaPool.balances(1);
      expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
      expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));

      // remove liquidity one coin 3CRV only so that uAD will be worth less
      const admBalance = await metaPool.balanceOf(await admin.getAddress());
      // calculation to withdraw 1e18 LP token
      // Calculate the amount received when withdrawing and unwrapping in a single coin.
      // Useful for setting _max_burn_amount when calling remove_liquidity_one_coin.
      const lpTo3CRV = await metaPool["calc_withdraw_one_coin(uint256,int128)"](
        oneETH,
        1
      );

      const expected = lpTo3CRV.div(100).mul(99);
      // approve metapool to burn LP on behalf of admin
      await metaPool.approve(metaPool.address, admBalance);

      // Withdraw a single asset from the pool.
      await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
        oneETH,
        1,
        expected
      );

      await twapOracle.update();
      // Price must be below 1 to mint coupons
      const uADPrice = await twapOracle.consult(uAD.address);
      expect(uADPrice).to.be.lt(oneETH);
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);
      const amountToExchangeForCoupon = oneETH;
      const secondAccountAdr = await secondAccount.getAddress();
      const balanceBefore = await uAD.balanceOf(secondAccountAdr);

      // approve debtCouponManager to burn user's token
      await uAD
        .connect(secondAccount)
        .approve(debtCouponMgr.address, amountToExchangeForCoupon);
      const lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const couponToMint = await couponsForDollarsCalculator.getCouponAmount(
        amountToExchangeForCoupon
      );
      const expiryBlock = lastBlock.number + 1 + couponLengthBlocks;
      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .exchangeDollarsForCoupons(amountToExchangeForCoupon)
      )
        .to.emit(debtCoupon, "MintedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, couponToMint);

      const balanceAfter = await uAD.balanceOf(secondAccountAdr);

      expect(
        balanceBefore.sub(balanceAfter).sub(amountToExchangeForCoupon)
      ).to.equal(0);
      // check that we have a debt coupon with correct premium
      const debtCoupons = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      expect(debtCoupons).to.equal(couponToMint);

      // check outstanding debt now
      const totalOutstandingDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalOutstandingDebt).to.equal(debtCoupons);

      // Price must be above 1 to redeem coupon
      // we previously removed 3CRV from the pool meaning uAD is <1$ because
      // we have more uAD than 3CRV. In order to make uAD >1$ we will swap 3CRV
      // for uAD.
      // Note that we previously burnt uAD but as we get the price from curve the
      // uAD burnt didn't affect the price
      const whale3CRVBalanceBeforeSwap = await crvToken.balanceOf(
        curveWhaleAddress
      );
      const CRVAmountToSwap = ethers.utils.parseEther("1000");

      // Exchange (swap)
      let dy3CRVtouAD = await swap3CRVtoUAD(
        CRVAmountToSwap.sub(BigNumber.from(1)),
        curveWhale
      );
      await twapOracle.update();
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      dy3CRVtouAD = dy3CRVtouAD.add(BigNumber.from(1));
      await twapOracle.update();
      const whale3CRVBalance = await crvToken.balanceOf(curveWhaleAddress);
      const whaleuADBalance = await uAD.balanceOf(curveWhaleAddress);

      expect(whaleuADBalance).to.equal(dy3CRVtouAD);
      expect(whale3CRVBalance).to.equal(
        whale3CRVBalanceBeforeSwap.sub(CRVAmountToSwap)
      );

      await twapOracle.update();
      const uADPriceAfterSwap = await twapOracle.consult(uAD.address);
      expect(uADPriceAfterSwap).to.be.gt(oneETH);

      // now we can redeem the coupon
      // 1. this will update the total debt by going through all the debt coupon that are
      // not expired it should be equal to debtCoupons here as we don't have uAR
      // 2. it calculates the mintable uAD based on the mint rules
      // where we don't expand the supply of uAD too much during an up cyle
      // (down cycle begins when we burn uAD for debtCoupon see func: exchangeDollarsForCoupons() )
      // we only expand (price-1)* total Supply % more uAD at maximum see func: getDollarsToMint()
      // this means that you may have coupon left after calling redeemCoupons()
      // this is indeed on a first come first served basis
      // 3. if the minted amount is > totalOutstandingDebt the excess is distributed
      // 10% to treasury 10% to uGov fund and 80% to LP provider

      // debtCouponMgr uad balance should be empty
      let debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(0);
      const userUADBalanceBeforeRedeem = await uAD.balanceOf(secondAccountAdr);
      const mintableUAD = await dollarMintingCalculator.getDollarsToMint();
      const excessUAD = mintableUAD.sub(debtCoupons);
      const totalSupply = await uAD.totalSupply();

      expect(mintableUAD).to.equal(
        calcPercentage(
          totalSupply.toString(),
          uADPriceAfterSwap.sub(oneETH).toString()
        )
      );

      // secondAccount must approve debtCouponMgr to manage all of its debtCoupons
      // indeed debtCouponMgr will burn the user's debtCoupon
      await expect(
        debtCoupon
          .connect(secondAccount)
          .setApprovalForAll(debtCouponMgr.address, true)
      )
        .to.emit(debtCoupon, "ApprovalForAll")
        .withArgs(secondAccountAdr, debtCouponMgr.address, true);

      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .redeemCoupons(expiryBlock, debtCoupons)
      )
        .to.emit(debtCoupon, "BurnedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, debtCoupons)
        .and.to.emit(uAD, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          debtCouponMgr.address,
          mintableUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of uAD to user
        .withArgs(debtCouponMgr.address, secondAccountAdr, debtCoupons)
        .and.to.emit(uAD, "Transfer") //  transfer  excess minted uAD to excess distributor
        .withArgs(
          debtCouponMgr.address,
          excessDollarsDistributor.address,
          excessUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to treasury
        .withArgs(
          excessDollarsDistributor.address,
          await treasury.getAddress(),
          excessUAD.div(10).toString()
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to uGov
        .withArgs(
          excessDollarsDistributor.address,
          await uGOVFund.getAddress(),
          excessUAD.div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 80% of excess minted uAD to lpRewards
        .withArgs(
          excessDollarsDistributor.address,
          await lpReward.getAddress(),
          excessUAD.sub(excessUAD.div(10)).sub(excessUAD.div(10))
        )
        .and.to.emit(debtCoupon, "TransferSingle") // ERC1155
        .withArgs(
          debtCouponMgr.address,
          secondAccountAdr,
          ethers.constants.AddressZero,
          expiryBlock,
          debtCoupons
        );
      // we minted more uAD than what we needed for our coupon
      expect(mintableUAD).to.be.gt(debtCoupons);

      const userUADBalanceAfterRedeem = await uAD.balanceOf(secondAccountAdr);
      expect(userUADBalanceAfterRedeem).to.equal(
        userUADBalanceBeforeRedeem.add(debtCoupons)
      );
      // check that we don't have debt coupon anymore
      const debtCouponsAfterRedeem = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      expect(debtCouponsAfterRedeem).to.equal(0);

      // debtCouponMgr uad balance should be empty because all minted UAD have been transfered
      // to coupon holder and excessDistributor
      debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(0);

      // excess distributor have distributed everything
      const excessDistributoUADBalance = await uAD.balanceOf(
        excessDollarsDistributor.address
      );
      expect(excessDistributoUADBalance).to.equal(0);
    });
    it("calling exchangeDollarsForCoupons twice in up cycle should mint uAD a second time only based on the inflation", async () => {
      // Price must be below 1 to mint coupons
      const uADPrice = await twapOracle.consult(uAD.address);
      // remove liquidity one coin 3CRV only so that uAD will be worth less
      const admBalance = await metaPool.balanceOf(await admin.getAddress());

      // calculation to withdraw 1e18 LP token
      // Calculate the amount received when withdrawing and unwrapping in a single coin.
      // Useful for setting _max_burn_amount when calling remove_liquidity_one_coin.
      const lpTo3CRV = await metaPool["calc_withdraw_one_coin(uint256,int128)"](
        oneETH,
        1
      );

      const expected = lpTo3CRV.div(100).mul(99);
      // approve metapool to burn LP on behalf of admin
      await metaPool.approve(metaPool.address, admBalance);

      await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
        oneETH,
        1,
        expected
      );

      await twapOracle.update();
      const uADPriceAfter = await twapOracle.consult(uAD.address);
      expect(uADPriceAfter).to.be.lt(uADPrice);
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);

      const amountToExchangeForCoupon = ethers.utils.parseEther("2");
      const secondAccountAdr = await secondAccount.getAddress();
      // approve debtCouponManager to burn user's token
      await uAD
        .connect(secondAccount)
        .approve(debtCouponMgr.address, amountToExchangeForCoupon);
      const lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );

      const expiryBlock = lastBlock.number + 1 + couponLengthBlocks;

      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .exchangeDollarsForCoupons(amountToExchangeForCoupon)
      ).to.emit(debtCoupon, "MintedCoupons");
      const debtCoupons = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      // Price must be above 1 to redeem coupon
      // we previously removed 3CRV from the pool meaning uAD is <1$ because
      // we have more uAD than 3CRV. In order to make uAD >1$ we will swap 3CRV
      // for uAD.
      // Note that we previously burnt uAD but as we get the price from curve the
      // uAD burnt didn't affect the price

      const CRVAmountToSwap = ethers.utils.parseEther("1000");

      // Exchange (swap)
      await swap3CRVtoUAD(CRVAmountToSwap.sub(BigNumber.from(1)), curveWhale);
      await twapOracle.update();
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      await twapOracle.update();

      const uADPriceAfterSwap = await twapOracle.consult(uAD.address);
      expect(uADPriceAfterSwap).to.be.gt(oneETH);

      // now we can redeem the coupon
      // 1. this will update the total debt by going through all the debt coupon that are
      // not expired it should be equal to debtCoupons here as we don't have uAR
      // 2. it calculates the mintable uAD based on the mint rules
      // where we don't expand the supply of uAD too much during an up cyle
      // (down cycle begins when we burn uAD for debtCoupon see func: exchangeDollarsForCoupons() )
      // we only expand (price-1)* total Supply % more uAD at maximum see func: getDollarsToMint()
      // this means that you may have coupon left after calling redeemCoupons()
      // this is indeed on a first come first served basis
      // 3. if the minted amount is > totalOutstandingDebt the excess is distributed
      // 10% to treasury 10% to uGov fund and 80% to LP provider

      // debtCouponMgr uad balance should be empty
      let debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(0);
      const userUADBalanceBeforeRedeem = await uAD.balanceOf(secondAccountAdr);
      const mintableUAD = await dollarMintingCalculator.getDollarsToMint();
      const excessUAD = mintableUAD.sub(debtCoupons);
      const totalSupply = await uAD.totalSupply();

      expect(mintableUAD).to.equal(
        calcPercentage(
          totalSupply.toString(),
          uADPriceAfterSwap.sub(oneETH).toString()
        )
      );

      // secondAccount must approve debtCouponMgr to manage all of its debtCoupons
      // indeed debtCouponMgr will burn the user's debtCoupon
      await expect(
        debtCoupon
          .connect(secondAccount)
          .setApprovalForAll(debtCouponMgr.address, true)
      )
        .to.emit(debtCoupon, "ApprovalForAll")
        .withArgs(secondAccountAdr, debtCouponMgr.address, true);
      // only redeem 1 coupon
      await expect(
        debtCouponMgr.connect(secondAccount).redeemCoupons(expiryBlock, oneETH)
      )
        .to.emit(debtCoupon, "BurnedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, oneETH)
        .and.to.emit(uAD, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          debtCouponMgr.address,
          mintableUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of uAD to user
        .withArgs(debtCouponMgr.address, secondAccountAdr, oneETH)
        .and.to.emit(uAD, "Transfer") //  transfer  excess minted uAD to excess distributor
        .withArgs(
          debtCouponMgr.address,
          excessDollarsDistributor.address,
          excessUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to treasury
        .withArgs(
          excessDollarsDistributor.address,
          await treasury.getAddress(),
          excessUAD.div(10).toString()
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to uGov
        .withArgs(
          excessDollarsDistributor.address,
          await uGOVFund.getAddress(),
          excessUAD.div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 80% of excess minted uAD to lpRewards
        .withArgs(
          excessDollarsDistributor.address,
          await lpReward.getAddress(),
          excessUAD.sub(excessUAD.div(10)).sub(excessUAD.div(10))
        )
        .and.to.emit(debtCoupon, "TransferSingle") // ERC1155
        .withArgs(
          debtCouponMgr.address,
          secondAccountAdr,
          ethers.constants.AddressZero,
          expiryBlock,
          oneETH
        );
      // we minted more uAD than what we needed for our coupon
      expect(mintableUAD).to.be.gt(debtCoupons);

      const userUADBalanceAfterRedeem = await uAD.balanceOf(secondAccountAdr);

      expect(userUADBalanceAfterRedeem).to.equal(
        userUADBalanceBeforeRedeem.add(oneETH)
      );
      // check that we  have still one debt coupon
      const debtCouponsAfterRedeem = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      expect(debtCouponsAfterRedeem).to.equal(oneETH);

      // debtCouponMgr uad balance should not be empty because not all minted UAD have been transfered
      // to coupon holder and excessDistributor
      debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(oneETH);

      // excess distributor have distributed everything in excess
      const excessDistributoUADBalance = await uAD.balanceOf(
        excessDollarsDistributor.address
      );
      expect(excessDistributoUADBalance).to.equal(0);
      //  make sure that calling getDollarsToMint twice doesn't mint all dollars twice
      const mintableUADThisTime = await dollarMintingCalculator.getDollarsToMint();
      const dollarsToMint = mintableUADThisTime.sub(mintableUAD);
      // dollars to mint should be only a fraction of the previously inflation of uAD total Supply

      const newCalculatedMintedUAD = calcPercentage(
        mintableUAD.toString(),
        uADPriceAfterSwap.sub(oneETH).toString()
      );
      expect(newCalculatedMintedUAD).to.equal(dollarsToMint);

      // redeem the last 1 coupon
      await expect(
        debtCouponMgr.connect(secondAccount).redeemCoupons(expiryBlock, oneETH)
      )
        .to.emit(debtCoupon, "BurnedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, oneETH)
        .and.to.emit(uAD, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          debtCouponMgr.address,
          dollarsToMint
        )
        .and.to.emit(uAD, "Transfer") //  transfer of uAD to user
        .withArgs(debtCouponMgr.address, secondAccountAdr, oneETH)
        .and.to.emit(uAD, "Transfer") //  transfer  excess minted uAD to excess distributor
        .withArgs(
          debtCouponMgr.address,
          excessDollarsDistributor.address,
          dollarsToMint
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to treasury
        .withArgs(
          excessDollarsDistributor.address,
          await treasury.getAddress(),
          dollarsToMint.div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to uGov
        .withArgs(
          excessDollarsDistributor.address,
          await uGOVFund.getAddress(),
          dollarsToMint.div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 80% of excess minted uAD to lpRewards
        .withArgs(
          excessDollarsDistributor.address,
          await lpReward.getAddress(),
          dollarsToMint.sub(dollarsToMint.div(10)).sub(dollarsToMint.div(10))
        )
        .and.to.emit(debtCoupon, "TransferSingle") // ERC1155
        .withArgs(
          debtCouponMgr.address,
          secondAccountAdr,
          ethers.constants.AddressZero,
          expiryBlock,
          oneETH
        );
    });
    it("calling exchangeDollarsForCoupons twice after up and down cycle should reset dollarsMintedThisCycle to zero", async () => {
      // Price must be below 1 to mint coupons
      const uADPrice = await twapOracle.consult(uAD.address);
      // remove liquidity one coin 3CRV only so that uAD will be worth less
      const admBalance = await metaPool.balanceOf(await admin.getAddress());

      // calculation to withdraw 1e18 LP token
      // Calculate the amount received when withdrawing and unwrapping in a single coin.
      // Useful for setting _max_burn_amount when calling remove_liquidity_one_coin.
      const lpTo3CRV = await metaPool["calc_withdraw_one_coin(uint256,int128)"](
        oneETH,
        1
      );

      const expected = lpTo3CRV.div(100).mul(99);
      // approve metapool to burn LP on behalf of admin
      await metaPool.approve(metaPool.address, admBalance);

      await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
        oneETH,
        1,
        expected
      );

      await twapOracle.update();
      const uADPriceAfter = await twapOracle.consult(uAD.address);
      expect(uADPriceAfter).to.be.lt(uADPrice);
      // check that total debt is null
      const totalDebt = await debtCoupon.getTotalOutstandingDebt();
      expect(totalDebt).to.equal(0);

      const amountToExchangeForCoupon = ethers.utils.parseEther("2");
      const secondAccountAdr = await secondAccount.getAddress();
      // approve debtCouponManager to burn user's token
      await uAD
        .connect(secondAccount)
        .approve(debtCouponMgr.address, amountToExchangeForCoupon.add(oneETH));
      let lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );

      const expiryBlock = lastBlock.number + 1 + couponLengthBlocks;

      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .exchangeDollarsForCoupons(amountToExchangeForCoupon)
      ).to.emit(debtCoupon, "MintedCoupons");
      let debtCoupons = await debtCoupon.balanceOf(
        secondAccountAdr,
        expiryBlock
      );
      // Price must be above 1 to redeem coupon
      // we previously removed 3CRV from the pool meaning uAD is <1$ because
      // we have more uAD than 3CRV. In order to make uAD >1$ we will swap 3CRV
      // for uAD.
      // Note that we previously burnt uAD but as we get the price from curve the
      // uAD burnt didn't affect the price

      let CRVAmountToSwap = ethers.utils.parseEther("1000");

      // Exchange (swap)
      await swap3CRVtoUAD(CRVAmountToSwap.sub(BigNumber.from(1)), curveWhale);
      await twapOracle.update();
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      await twapOracle.update();

      let uADPriceAfterSwap = await twapOracle.consult(uAD.address);
      expect(uADPriceAfterSwap).to.be.gt(oneETH);

      // now we can redeem the coupon
      // 1. this will update the total debt by going through all the debt coupon that are
      // not expired it should be equal to debtCoupons here as we don't have uAR
      // 2. it calculates the mintable uAD based on the mint rules
      // where we don't expand the supply of uAD too much during an up cyle
      // (down cycle begins when we burn uAD for debtCoupon see func: exchangeDollarsForCoupons() )
      // we only expand (price-1)* total Supply % more uAD at maximum see func: getDollarsToMint()
      // this means that you may have coupon left after calling redeemCoupons()
      // this is indeed on a first come first served basis
      // 3. if the minted amount is > totalOutstandingDebt the excess is distributed
      // 10% to treasury 10% to uGov fund and 80% to LP provider

      // debtCouponMgr uad balance should be empty
      let debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(0);
      const userUADBalanceBeforeRedeem = await uAD.balanceOf(secondAccountAdr);
      const mintableUAD = await dollarMintingCalculator.getDollarsToMint();
      const excessUAD = mintableUAD.sub(debtCoupons);
      let totalSupply = await uAD.totalSupply();

      expect(mintableUAD).to.equal(
        calcPercentage(
          totalSupply.toString(),
          uADPriceAfterSwap.sub(oneETH).toString()
        )
      );

      // secondAccount must approve debtCouponMgr to manage all of its debtCoupons
      // indeed debtCouponMgr will burn the user's debtCoupon
      await expect(
        debtCoupon
          .connect(secondAccount)
          .setApprovalForAll(debtCouponMgr.address, true)
      )
        .to.emit(debtCoupon, "ApprovalForAll")
        .withArgs(secondAccountAdr, debtCouponMgr.address, true);
      // only redeem 1 coupon
      await expect(
        debtCouponMgr.connect(secondAccount).redeemCoupons(expiryBlock, oneETH)
      )
        .to.emit(debtCoupon, "BurnedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, oneETH)
        .and.to.emit(uAD, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          debtCouponMgr.address,
          mintableUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of uAD to user
        .withArgs(debtCouponMgr.address, secondAccountAdr, oneETH)
        .and.to.emit(uAD, "Transfer") //  transfer  excess minted uAD to excess distributor
        .withArgs(
          debtCouponMgr.address,
          excessDollarsDistributor.address,
          excessUAD
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to treasury
        .withArgs(
          excessDollarsDistributor.address,
          await treasury.getAddress(),
          excessUAD.div(10).toString()
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to uGov
        .withArgs(
          excessDollarsDistributor.address,
          await uGOVFund.getAddress(),
          excessUAD.div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 80% of excess minted uAD to lpRewards
        .withArgs(
          excessDollarsDistributor.address,
          await lpReward.getAddress(),
          excessUAD.sub(excessUAD.div(10)).sub(excessUAD.div(10))
        )
        .and.to.emit(debtCoupon, "TransferSingle") // ERC1155
        .withArgs(
          debtCouponMgr.address,
          secondAccountAdr,
          ethers.constants.AddressZero,
          expiryBlock,
          oneETH
        );
      // we minted more uAD than what we needed for our coupon
      expect(mintableUAD).to.be.gt(debtCoupons);

      const userUADBalanceAfterRedeem = await uAD.balanceOf(secondAccountAdr);

      expect(userUADBalanceAfterRedeem).to.equal(
        userUADBalanceBeforeRedeem.add(oneETH)
      );
      // check that we  have still one debt coupon less
      debtCoupons = await debtCoupon.balanceOf(secondAccountAdr, expiryBlock);
      expect(debtCoupons).to.equal(amountToExchangeForCoupon.sub(oneETH));

      // debtCouponMgr uad balance should not be empty because not all minted UAD have been transfered
      // to coupon holder and excessDistributor
      debtUADBalance = await uAD.balanceOf(debtCouponMgr.address);
      expect(debtUADBalance).to.equal(oneETH);

      // excess distributor have distributed everything in excess
      const excessDistributoUADBalance = await uAD.balanceOf(
        excessDollarsDistributor.address
      );
      expect(excessDistributoUADBalance).to.equal(0);

      // swap again to go down 1$ and up again
      const uADAmountToSwap = ethers.utils.parseEther("1000");
      await swapUADto3CRV(
        uADAmountToSwap.sub(BigNumber.from(1)),
        secondAccount
      );
      await twapOracle.update();
      await swapUADto3CRV(BigNumber.from(1), secondAccount);
      await twapOracle.update();

      uADPriceAfterSwap = await twapOracle.consult(uAD.address);
      expect(uADPriceAfterSwap).to.be.lt(oneETH);
      // mint debtCoupon this is needed to reset the dollarsMintedThisCycle
      lastBlock = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const newExpiryBlock = lastBlock.number + 1 + couponLengthBlocks;
      totalSupply = await uAD.totalSupply();
      await expect(
        debtCouponMgr.connect(secondAccount).exchangeDollarsForCoupons(oneETH)
      ).to.emit(debtCoupon, "MintedCoupons");

      const newDebtCoupons = await debtCoupon.balanceOf(
        secondAccountAdr,
        newExpiryBlock
      );
      // coupon premium is 1/(1-total_debt/total_supply)²
      expect(newDebtCoupons).to.equal(
        calcPremium(
          oneETH.toString(),
          totalSupply.toString(),
          oneETH.toString()
        )
      );
      // swap to be > 1$
      CRVAmountToSwap = ethers.utils.parseEther("1000");

      // Exchange (swap)
      await swap3CRVtoUAD(CRVAmountToSwap.sub(BigNumber.from(1)), curveWhale);
      await twapOracle.update();
      await swap3CRVtoUAD(BigNumber.from(1), curveWhale);
      await twapOracle.update();

      uADPriceAfterSwap = await twapOracle.consult(uAD.address);
      expect(uADPriceAfterSwap).to.be.gt(oneETH);

      //  make sure that calling getDollarsToMint twice doesn't mint all dollars twice
      const mintableUADThisTime = await dollarMintingCalculator.getDollarsToMint();
      // const dollarsToMint = mintableUADThisTime.sub(mintableUAD);
      // dollars to mint should be only a fraction of the previously inflation of uAD total Supply

      totalSupply = await uAD.totalSupply();
      const newCalculatedMintedUAD = calcPercentage(
        totalSupply.toString(),
        uADPriceAfterSwap.sub(oneETH).toString()
      );
      expect(newCalculatedMintedUAD).to.equal(mintableUADThisTime);

      // redeem the last 1 coupon
      await expect(
        debtCouponMgr
          .connect(secondAccount)
          .redeemCoupons(expiryBlock, debtCoupons)
      )
        .to.emit(debtCoupon, "BurnedCoupons")
        .withArgs(secondAccountAdr, expiryBlock, debtCoupons)
        .and.to.emit(uAD, "Transfer") //  minting of uad;
        .withArgs(
          ethers.constants.AddressZero,
          debtCouponMgr.address,
          mintableUADThisTime
        )
        .and.to.emit(uAD, "Transfer") //  transfer of uAD to user
        .withArgs(debtCouponMgr.address, secondAccountAdr, debtCoupons)
        .and.to.emit(uAD, "Transfer") //  transfer  excess minted uAD to excess distributor
        .withArgs(
          debtCouponMgr.address,
          excessDollarsDistributor.address,
          mintableUADThisTime.sub(newDebtCoupons)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to treasury
        .withArgs(
          excessDollarsDistributor.address,
          await treasury.getAddress(),
          mintableUADThisTime.sub(newDebtCoupons).div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 10% of excess minted uAD to uGov
        .withArgs(
          excessDollarsDistributor.address,
          await uGOVFund.getAddress(),
          mintableUADThisTime.sub(newDebtCoupons).div(10)
        )
        .and.to.emit(uAD, "Transfer") //  transfer of 80% of excess minted uAD to lpRewards
        .withArgs(
          excessDollarsDistributor.address,
          await lpReward.getAddress(),
          mintableUADThisTime
            .sub(newDebtCoupons)
            .sub(mintableUADThisTime.sub(newDebtCoupons).div(10))
            .sub(mintableUADThisTime.sub(newDebtCoupons).div(10))
        )
        .and.to.emit(debtCoupon, "TransferSingle") // ERC1155
        .withArgs(
          debtCouponMgr.address,
          secondAccountAdr,
          ethers.constants.AddressZero,
          expiryBlock,
          debtCoupons
        );
    });
  });
});
