import { ContractTransaction, Signer } from "ethers";
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
    await bondingShare
      .connect(admin)
      .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);
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
        .approve(bonding.address, ethers.BigNumber.from("0"));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
        await secondAccount.getAddress(),
        id
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
        await secondAccount.getAddress(),
        id
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
        await bondingShare.balanceOf(await secondAccount.getAddress(), id)
      );
    });
  });
});
