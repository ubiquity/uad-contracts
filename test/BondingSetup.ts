import { ContractTransaction, Signer, BigNumber } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingShare } from "../artifacts/types/BondingShare";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
// import { ICurveFactory } from "../artifacts/types/ICurveFactory";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";

let twapOracle: TWAPOracle;
let metaPool: IMetaPool;
let bonding: Bonding;
let bondingShare: BondingShare;
let manager: UbiquityAlgorithmicDollarManager;
let uAD: UbiquityAlgorithmicDollar;
let sablier: string;
let DAI: string;
let USDC: string;
// let curvePoolFactory: ICurveFactory;
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
let ubiquityFormulas: UbiquityFormulas;

function log(bigN: BigNumber): void {
  console.log(ethers.utils.formatEther(bigN));
}

type IdBond = {
  id: number;
  bond: BigNumber;
};
interface IbondTokens {
  (signer: Signer, amount: BigNumber, duration: number): Promise<IdBond>;
}

// First block 2020 = 9193266 https://etherscan.io/block/9193266
// First block 2021 = 11565019 https://etherscan.io/block/11565019
// 2020 = 2371753 block = 366 days
// 1 week = 45361 blocks = 2371753*7/366
// n = (block + duration * 45361)
// id = n - n / 100
const bondTokens: IbondTokens = async function (
  signer: Signer,
  amount: BigNumber,
  duration: number
) {
  const address = await signer.getAddress();

  await metaPool.connect(signer).approve(bonding.address, amount);
  const tx = await (
    await bonding.connect(signer).bondTokens(amount, duration)
  ).wait();

  // 1 week = 45361 blocks
  const n = tx.blockNumber + duration * 45361;
  const id = n - (n % 100);
  // console.log("n", n);
  // console.log("id", id);
  const bond: BigNumber = await bondingShare.balanceOf(address, id);

  return { id, bond };
};

async function redeemShares(signer: Signer, id: number): Promise<BigNumber> {
  const address = await signer.getAddress();
  const bond: BigNumber = await bondingShare.balanceOf(address, id);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  await bondingShare.connect(signer).setApprovalForAll(bonding.address, true);
  await bonding.connect(signer).redeemShares(bond, id);

  return metaPool.balanceOf(address);
}

async function bondingSetup(): Promise<{
  admin: Signer;
  secondAccount: Signer;
  thirdAccount: Signer;
  uAD: UbiquityAlgorithmicDollar;
  metaPool: IMetaPool;
  bonding: Bonding;
  bondingShare: BondingShare;
  twapOracle: TWAPOracle;
  ubiquityFormulas: UbiquityFormulas;
  sablier: string;
  DAI: string;
  USDC: string;
  manager: UbiquityAlgorithmicDollarManager;
}> {
  // GET contracts adresses
  ({
    sablier,
    DAI,
    USDC,
    curveFactory,
    curve3CrvBasePool,
    curve3CrvToken,
    curveWhaleAddress,
  } = await getNamedAccounts());

  // GET first EOA account as admin Signer
  [admin, secondAccount, thirdAccount] = await ethers.getSigners();
  adminAddress = await admin.getAddress();
  secondAddress = await secondAccount.getAddress();
  // thirdAddress = await thirdAccount.getAddress();

  // DEPLOY UbiquityAlgorithmicDollarManager Contract
  manager = (await (
    await ethers.getContractFactory("UbiquityAlgorithmicDollarManager")
  ).deploy(adminAddress)) as UbiquityAlgorithmicDollarManager;

  // DEPLOY Ubiquity library
  ubiquityFormulas = (await (
    await ethers.getContractFactory("UbiquityFormulas")
  ).deploy()) as UbiquityFormulas;

  // DEPLOY Bonding Contract
  bonding = (await (
    await ethers.getContractFactory("Bonding", {
      libraries: {
        UbiquityFormulas: ubiquityFormulas.address,
      },
    })
  ).deploy(manager.address, sablier)) as Bonding;
  await manager.setBondingContractAddress(bonding.address);

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
  // curvePoolFactory = (await ethers.getContractAt(
  //   "ICurveFactory",
  //   curveFactory
  // )) as ICurveFactory;

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

  // TRANSFER some uLP tokens to bonding contract to pay premium
  await metaPool
    .connect(admin)
    .transfer(bonding.address, ethers.utils.parseEther("100"));

  // TRANSFER some uLP tokens to second account
  await metaPool
    .connect(admin)
    .transfer(secondAddress, ethers.utils.parseEther("1000"));

  // DEPLOY TWAPOracle Contract
  twapOracle = (await (await ethers.getContractFactory("TWAPOracle")).deploy(
    metaPoolAddr,
    uAD.address,
    curve3CrvToken
  )) as TWAPOracle;
  await manager.setTwapOracleAddress(twapOracle.address);

  return {
    admin,
    secondAccount,
    thirdAccount,
    uAD,
    metaPool,
    bonding,
    bondingShare,
    twapOracle,
    ubiquityFormulas,
    sablier,
    DAI,
    USDC,
    manager,
  };
}

export { bondingSetup, bondTokens, redeemShares, log };
