import { expect } from "chai";
import { ContractTransaction, Signer, BigNumber } from "ethers";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { BondingShare } from "../artifacts/types/BondingShare";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";
import { Bonding } from "../artifacts/types/Bonding";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";

const id = 42;
const one: BigNumber = BigNumber.from(10).pow(18);
const ten9: BigNumber = BigNumber.from(10).pow(9);

let twapOracle: TWAPOracle;
let metaPool: IMetaPool;
let bonding: Bonding;
let bondingShare: BondingShare;
let manager: UbiquityAlgorithmicDollarManager;
let uAD: UbiquityAlgorithmicDollar;
let sablier: string;
let curvePoolFactory: ICurveFactory;
let curveFactory: string;
let curve3CrvBasePool: string;
let curve3CrvToken: string;
let curveWhaleAddress: string;
let metaPoolAddr: string;
let admin: Signer;
let secondAccount: Signer;
let thirdAccount: Signer;
let adminAddress: string;
let secondAddress: string;
let thirdAddress: string;

function log(bigN: BigNumber): string {
  return ethers.utils.formatEther(bigN);
}

async function bondTokens(
  signer: Signer,
  amount: BigNumber,
  duration: BigNumber,
  block: number
): Promise<BigNumber> {
  const address = await signer.getAddress();
  const bond0: BigNumber = await bondingShare.balanceOf(address, block);

  await metaPool.connect(signer).approve(bonding.address, amount);
  await bonding.connect(signer).bondTokens(amount, duration);

  const bond1: BigNumber = await bondingShare.balanceOf(address, block);
  const deltaBond: BigNumber = bond1.sub(bond0);

  return deltaBond;
}

async function redeemShares(signer: Signer, block: number): Promise<BigNumber> {
  const address = await signer.getAddress();
  const newBalLp: BigNumber = await metaPool.balanceOf(bonding.address);

  const newBalBond: BigNumber = await bondingShare.balanceOf(address, block);

  await bondingShare.connect(signer).setApprovalForAll(bonding.address, true);
  await bonding.connect(signer).redeemShares(newBalBond);

  const finalBalLp: BigNumber = await metaPool.balanceOf(bonding.address);
  const deltaBalLp: BigNumber = finalBalLp.sub(newBalLp);

  return deltaBalLp;
}

describe("UseCase1", () => {
  before(async () => {
    // GET contracts adresses
    ({
      sablier,
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());

    // GET first EOA account as admin Signer
    [admin, secondAccount, thirdAccount] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
    secondAddress = await secondAccount.getAddress();
    thirdAddress = await thirdAccount.getAddress();

    // DEPLOY UbiquityAlgorithmicDollarManager Contract
    manager = (await (
      await ethers.getContractFactory("UbiquityAlgorithmicDollarManager")
    ).deploy(adminAddress)) as UbiquityAlgorithmicDollarManager;

    // DEPLOY Bonding Contract
    bonding = (await (await ethers.getContractFactory("Bonding")).deploy(
      manager.address,
      sablier
    )) as Bonding;
    await manager.setLpRewardsAddress(bonding.address);

    // DEPLOY BondingShare Contract
    bondingShare = (await (
      await ethers.getContractFactory("BondingShare")
    ).deploy(manager.address)) as BondingShare;
    await manager.setBondingShareAddress(bondingShare.address);

    // DEPLOY UAD token Contract
    uAD = (await (
      await ethers.getContractFactory("UbiquityAlgorithmicDollar")
    ).deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setuADTokenAddress(uAD.address);

    // GET 3CRV token contract
    const crvToken: ERC20 = (await ethers.getContractAt(
      "ERC20",
      curve3CrvToken
    )) as ERC20;

    // GET curve factory contract
    curvePoolFactory = (await ethers.getContractAt(
      "ICurveFactory",
      curveFactory
    )) as ICurveFactory;

    // Mint 10000 uAD each for admin, second account and manager
    const mintings = [adminAddress, secondAddress, manager.address].map(
      async (signer: string): Promise<ContractTransaction> =>
        uAD.mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    // Impersonate curve whale account
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    const curveWhale = ethers.provider.getSigner(curveWhaleAddress);

    // Mint uAD for whale
    await uAD.mint(curveWhaleAddress, ethers.utils.parseEther("10"));
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));
    await manager.deployStableSwapPool(
      curveFactory,
      curve3CrvBasePool,
      crvToken.address,
      10,
      4000000
    );
    metaPoolAddr = await manager.stableSwapMetaPoolAddress();

    // GET curve meta pool contract
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;

    // TRANSFER some uLP tokens to second account
    await metaPool
      .connect(admin)
      .transfer(secondAddress, ethers.utils.parseEther("2000"));

    // DEPLOY TWAPOracle Contract
    twapOracle = (await (await ethers.getContractFactory("TWAPOracle")).deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken
    )) as TWAPOracle;
    await manager.setTwapOracleAddress(twapOracle.address);
  });

  describe("Bonding and Redeem", () => {
    it("admin should have some uLP tokens", async () => {
      expect(await metaPool.balanceOf(adminAddress)).to.be.gt(one.mul(1000));
    });

    it("second account should have some uLP tokens", async () => {
      expect(await metaPool.balanceOf(secondAddress)).to.be.gt(one.mul(1000));
    });

    it("third account should have no uLP tokens", async () => {
      expect(await metaPool.balanceOf(thirdAddress)).to.be.equal(0);
    });

    it("admin should be able to bound", async () => {
      expect(
        await bondTokens(admin, one.mul(100), BigNumber.from(0), id)
      ).to.be.equal(one.mul(100));
      // console.log("total uLP", log(await metaPool.balanceOf(bonding.address)));
    });
    // uLP = 100
    // uBOND = 100
    it("second account should be able to bound", async () => {
      expect(
        await bondTokens(secondAccount, one.mul(100), BigNumber.from(0), id)
      ).to.be.equal(one.mul(50));
    });
    // uLP = 200
    // uBOND = 150
    it("third account should not be able to bound", async () => {
      await expect(
        bondTokens(thirdAccount, BigNumber.from(1), BigNumber.from(1), id)
      ).to.be.revertedWith("revert SafeERC20: low-level call failed");
    });

    it("total uLP should be 200", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.equal(one.mul(200));
    });

    it("total uBOND should be 150", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(one.mul(150));
    });

    it("admin account should be able to redeem uBOND", async () => {
      await redeemShares(admin, id);
      expect(await bondingShare.balanceOf(adminAddress, id)).to.be.equal(0);
    });
    // uLP = 100
    // uBOND = 50
    it("second account should be able to redeem uBOND", async () => {
      await redeemShares(secondAccount, id);
      expect(await bondingShare.balanceOf(secondAddress, id)).to.be.equal(0);
    });
    // uLP = 0
    // uBOND = 0
    it("third account should be able to redeem uBOND", async () => {
      await redeemShares(thirdAccount, id);
      expect(await bondingShare.balanceOf(thirdAddress, id)).to.be.equal(0);
    });

    it("total uBOND should be 0 after redeem", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(0);
    });

    it("total uLP should be 0 after redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.lt(ten9);
    });
  });

  describe("UseCase bond uLP tokens and immediate withdraw", () => {
    it("deposit 100 LPs tokens for 6 weeks should give 101.469693845 bond tokens", async () => {
      const deltaBond: BigNumber = await bondTokens(
        secondAccount,
        one.mul(100),
        BigNumber.from(6),
        id
      );
      expect(deltaBond.sub(ten9.mul(101469693845)).abs()).to.be.lt(ten9);
    });
    // uLP = 100
    // uBOND = 100.469693845
    it("redeemShares should give back 100 LPs tokens", async () => {
      const deltaBalLp: BigNumber = await redeemShares(secondAccount, id);
      expect(deltaBalLp.add(one.mul(100)).abs()).to.be.lt(ten9);
    });
    // uLP = 0
    // uBOND = 0
    it("total uBOND should be 0 after redeem", async () => {
      const totalUBOND: BigNumber = await bondingShare.totalSupply(id);
      expect(totalUBOND).to.be.equal(0);
    });

    it("total uLP should be 0 after redeem", async () => {
      const totalLP: BigNumber = await metaPool.balanceOf(bonding.address);
      expect(totalLP).to.be.lt(ten9);
    });
  });
});
