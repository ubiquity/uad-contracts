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

const id = 42;

describe("BondingShare", () => {
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

    const BondingShareDeployment = await deployments.deploy("BondingShare", {
      from: adminAddress,
      args: [adminAddress],
    });

    bondingShare = (await ethers.getContractAt(
      "BondingShare",
      BondingShareDeployment.address
    )) as BondingShare;

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
});
