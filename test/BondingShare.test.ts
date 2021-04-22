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

function log(bigN: BigNumber) {
  console.log(ethers.utils.formatEther(bigN));
}

describe("BondingShare", () => {
  const id = 42;
  const one = BigNumber.from(10).pow(18);

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
      args: [manager.address],
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
  });

  describe("initialValues", () => {
    it("TARGET_PRICE should always be 1", async () => {
      const targetPrice: BigNumber = await bonding.TARGET_PRICE();

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

  describe("durationMultiply", () => {
    it("durationMultiply of 0 should be 1", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-call
      const mult = await bonding.durationMultiply(one, 0);
      log(mult);

      expect(mult).to.eq(one);
    });

    it("durationMultiply of 1 should be 1.001", async () => {
      // 1.001 * 10**18 = 10**15 * 1001
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiply(one, 1));
      const epsilon = BigNumber.from(10).pow(15).mul(1001).sub(mult);
      log(mult);

      // 10**-9 expected precision on following calculations
      expect(epsilon.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiply of 4 should be 1.008", async () => {
      // 1.008 * 10**18 = 10**15 * 1008
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiply(one, 4));
      const epsilon = BigNumber.from(10).pow(15).mul(1008).sub(mult);
      log(mult);

      expect(epsilon.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiply of 24 should be 1.117575507", async () => {
      // 1.117575507 * 10**18 = 10**9 * 1117575507
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiply(one, 24));
      const epsilon = BigNumber.from(10).pow(9).mul(1117575507).sub(mult);
      log(mult);

      expect(epsilon.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiply of 52 should be 1.374977332", async () => {
      // 1.3749773326 * 10**18 = 10**9 * 1374977332
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiply(one, 52));
      const epsilon = BigNumber.from(10).pow(9).mul(1374977332).sub(mult);
      log(mult);

      expect(epsilon.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
    });

    it("durationMultiply of 520 should be 12.857824421", async () => {
      // 12.857824421 * 10**18 = 10**10 * 12857824421
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(await bonding.durationMultiply(one, 520));
      const epsilon = BigNumber.from(10).pow(10).mul(1285782442).sub(mult);
      log(mult);

      expect(epsilon.div(BigNumber.from(10).pow(8)).abs()).to.be.lte(10);
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

      // await bonding
      //   .connect(secondAccount)
      //   .redeemShares(prevBondingSharesBalance);

      // const newUADBalance = await uAD.balanceOf(
      //   await secondAccount.getAddress()
      // );

      // const newBondingSharesBalance = await bondingShare.balanceOf(
      //   await secondAccount.getAddress(),
      //   id
      // );

      // expect(prevUADBalance).to.be.lt(newUADBalance);

      // expect(prevBondingSharesBalance).to.be.gt(newBondingSharesBalance);

      // await bonding.connect(admin).setRedeemStreamTime(initialRedeemStreamTime);
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

      // await bonding.connect(secondAccount).bondTokens(amountToBond, 6);

      // const prevBondingSharesBalance = await bondingShare.balanceOf(
      //   await secondAccount.getAddress(),
      //   id
      // );

      // // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      // await bondingShare
      //   .connect(secondAccount)
      //   .setApprovalForAll(bonding.address, true);

      // await bonding
      //   .connect(secondAccount)
      //   .redeemShares(prevBondingSharesBalance);

      // expect(await uAD.balanceOf(await secondAccount.getAddress())).to.be.lt(
      //   prevUADBalance
      // );

      // expect(prevBondingSharesBalance).to.be.gt(
      //   await bondingShare.balanceOf(await secondAccount.getAddress(), id)
      // );
    });
  });
});
