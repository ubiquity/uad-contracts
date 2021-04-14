import { ContractTransaction, Signer, BigNumber } from "ethers";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { before, describe, it } from "mocha";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { BondingShare } from "../artifacts/types/BondingShare";
import { Bonding } from "../artifacts/types/Bonding";

describe("BondingShare", () => {
  const id = 42;

  let bonding: Bonding;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let secondAccount: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let sablier: string;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let twapOracle: TWAPOracle;
  let bondingShare: BondingShare;

  before(async () => {
    ({
      sablier,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();
    const adminAddress = await admin.getAddress();

    bondingShare = (await (await ethers.getContractFactory("BondingShare"))
      .connect(admin)
      .deploy(adminAddress)) as BondingShare;

    const Manager = await deployments.deploy(
      "UbiquityAlgorithmicDollarManager",
      {
        from: adminAddress,
        args: [adminAddress],
      }
    );

    manager = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollarManager",
      Manager.address
    )) as UbiquityAlgorithmicDollarManager;

    await manager.connect(admin).setBondingShareAddress(bondingShare.address);
    const UAD = await deployments.deploy("UbiquityAlgorithmicDollar", {
      from: adminAddress,
    });
    uAD = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollar",
      UAD.address
    )) as UbiquityAlgorithmicDollar;
    // mint 10000 uAD each for admin, manager and secondAccount
    const mintings = [
      adminAddress,
      await secondAccount.getAddress(),
      manager.address,
    ].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.connect(admin).mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);
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
    const TWAPOracleDeployment = await deployments.deploy("TWAPOracle", {
      from: adminAddress,
      args: [metaPoolAddr, uAD.address, curve3CrvToken],
    });
    twapOracle = (await ethers.getContractAt(
      "TWAPOracle",
      TWAPOracleDeployment.address
    )) as TWAPOracle;
    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);

    const BondingDeployment = await deployments.deploy("Bonding", {
      from: adminAddress,
      args: [manager.address, sablier],
    });
    bonding = (await ethers.getContractAt(
      "Bonding",
      BondingDeployment.address
    )) as Bonding;

    // if not first test: contract is not recreated properly, reset things
    await bonding.connect(admin).setSablier(sablier);
    await bonding
      .connect(admin)
      .setBondingDiscountMultiplier(BigNumber.from(10).pow(15));

    await bondingShare
      .connect(admin)
      .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);
  });

  describe("initialValues", () => {
    it("TARGET_PRICE should always be 1", async () => {
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();
      const one: BigNumber = BigNumber.from(10).pow(18);

      expect(targetPrice).to.eq(one);
    });

    it("initial uAD totalSupply should be more than 30 010 (3 * 10 000 + 10)", async () => {
      const uADtotalSupply: BigNumber = await uAD.totalSupply();
      const uADinitialSupply: BigNumber = BigNumber.from(10).pow(18).mul(30010);

      expect(uADtotalSupply).to.gte(uADinitialSupply);
    });

    it("initial bonding totalSupply should be 0", async () => {
      const bondTotalSupply: BigNumber = await bondingShare.totalSupply(id);
      const zero: BigNumber = BigNumber.from(0);

      expect(bondTotalSupply).to.eq(zero);
    });

    it("initial currentShareValue should be TARGET_PRICE", async () => {
      const currentShareValue: BigNumber = await bonding.currentShareValue();
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

      expect(currentShareValue).to.eq(targetPrice);
    });

    it("initial currentTokenPrice should be TARGET_PRICE", async () => {
      const currentTokenPrice: BigNumber = await bonding.currentTokenPrice();
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

      expect(currentTokenPrice).to.eq(targetPrice);
    });
  });

  describe("durationMultiplier", () => {
    it("durationMultiplier of 0 should be 0", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-call
      const durationMultiplier = await bonding.durationMultiplier(0);
      expect(durationMultiplier).to.eq(0);
    });

    it("durationMultiplier of 1 should be 0.001", async () => {
      // 0.001 * 10**18 = 10**15
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiplier(1));
      const delta = BigNumber.from(10).pow(15).sub(mult);

      // 10**-9 expected presision on following calculations
      expect(delta.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiplier of 4 should be 0.008", async () => {
      // 0.008 * 10**18 = 8 * 10**15
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiplier(4));
      const delta = BigNumber.from(10).pow(15).mul(8).sub(mult);

      expect(delta.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiplier of 24 should be 0.1175755077", async () => {
      // 0.1175755077 * 10**18 = 117575507 * 10**9
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiplier(24));
      const delta = BigNumber.from(10).pow(9).mul(117575507).sub(mult);

      expect(delta.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiplier of 52 should be 0.3749773326", async () => {
      // 0.3749773326 * 10**18 = 374977332 * 10**9
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiplier(52));
      const delta = BigNumber.from(10).pow(9).mul(374977332).sub(mult);

      expect(delta.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiplier of 520 should be 11.857824421", async () => {
      // 11.857824421 * 10**18 = 11857824421 * 10**9
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiplier(520));
      const delta = BigNumber.from(10).pow(9).mul(11857824421).sub(mult);

      expect(delta.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });
  });

  describe("afterBondingValues", () => {
    it("bonding 100 uAD should initially gives 100 bondingShares", async () => {
      const addr: string = await secondAccount.getAddress();
      const amount: BigNumber = BigNumber.from(10).pow(18).mul(100);
      // console.log((await bonding.currentShareValue()).toString());

      const initialBondBalance = await bondingShare.balanceOf(addr, id);
      expect(initialBondBalance).to.be.eq(0);

      await uAD.connect(secondAccount).approve(bonding.address, amount);
      await bonding.connect(secondAccount).bondTokens(amount);
      const finalBondBalance = await bondingShare.balanceOf(addr, id);

      expect(finalBondBalance).to.be.eq(amount.toString());

      // console.log((await bonding.currentShareValue()).toString());
    });
  });

  describe("bondTokens", () => {
    it("User should be able to bond uAD tokens", async () => {
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress(),
        id
      );
      const amountToBond = ethers.utils.parseEther("5000");
      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      await bonding.connect(secondAccount).bondTokens(amountToBond);

      const newBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress(),
        id
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
        await secondAccount.getAddress(),
        id
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await bondingShare
        .connect(secondAccount)
        .setApprovalForAll(bonding.address, true);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await bondingShare
        .connect(secondAccount)
        .setApprovalForAll(bonding.address, true);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      const newUADBalance = await uAD.balanceOf(
        await secondAccount.getAddress()
      );

      const newBondingSharesBalance = await bondingShare.balanceOf(
        await secondAccount.getAddress(),
        id
      );

      expect(prevUADBalance).to.be.lt(newUADBalance);

      expect(prevBondingSharesBalance).to.be.gt(newBondingSharesBalance);

      await bonding.connect(admin).setRedeemStreamTime(initialRedeemStreamTime);
    });

    it("Should return the current Sablier address", async () => {
      expect(await bonding.sablier()).to.equal(sablier);
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
        await secondAccount.getAddress(),
        id
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await bondingShare
        .connect(secondAccount)
        .setApprovalForAll(bonding.address, true);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      expect(await uAD.balanceOf(await secondAccount.getAddress())).to.be.lt(
        prevUADBalance
      );

      expect(prevBondingSharesBalance).to.be.gt(
        await bondingShare.balanceOf(await secondAccount.getAddress(), id)
      );
    });
  });
});
