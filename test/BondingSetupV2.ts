import { expect } from "chai";
import { ContractTransaction, Signer, BigNumber } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { Bonding } from "../artifacts/types/Bonding";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingFormulas } from "../artifacts/types/BondingFormulas";
import { BondingShare } from "../artifacts/types/BondingShare";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { ERC20 } from "../artifacts/types/ERC20";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { MasterChef } from "../artifacts/types/MasterChef";

let twapOracle: TWAPOracle;
let metaPool: IMetaPool;
let bonding: Bonding;
let bondingShare: BondingShare;
let bondingV2: BondingV2;
let bondingShareV2: BondingShareV2;
let masterChef: MasterChef;
let masterChefV2: MasterChefV2;
let manager: UbiquityAlgorithmicDollarManager;
let uAD: UbiquityAlgorithmicDollar;
let bondingFormulas: BondingFormulas;
let uGOV: UbiquityGovernance;
let sablier: string;
let DAI: string;
let USDC: string;
let curvePoolFactory: ICurveFactory;
let curveFactory: string;
let curve3CrvBasePool: string;
let curve3CrvToken: string;
let crvToken: ERC20;
let curveWhaleAddress: string;
let metaPoolAddr: string;
let admin: Signer;
let curveWhale: Signer;
let secondAccount: Signer;
let thirdAccount: Signer;
let fourthAccount: Signer;
let treasury: Signer;
let bondingMaxAccount: Signer;
let bondingMinAccount: Signer;
let adminAddress: string;
let secondAddress: string;
let ubiquityFormulas: UbiquityFormulas;
let blockCountInAWeek: BigNumber;

type IdBond = {
  id: BigNumber;
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
const deposit: IbondTokens = async function (
  signer: Signer,
  amount: BigNumber,
  duration: number
) {
  const signerAdr = await signer.getAddress();
  await metaPool.connect(signer).approve(bonding.address, amount);
  const blockBefore = await ethers.provider.getBlock(
    await ethers.provider.getBlockNumber()
  );
  const n = blockBefore.number + 1 + duration * blockCountInAWeek.toNumber();
  const endBlock = n - (n % 100);
  const zz1 = await bonding.bondingDiscountMultiplier(); // zz1 = zerozero1 = 0.001 ether = 10^16
  const multiplier = BigNumber.from(
    await ubiquityFormulas.durationMultiply(amount, duration, zz1)
  );
  const id = await bondingShareV2.totalSupply();
  await expect(bondingV2.connect(signer).deposit(amount, duration))
    .to.emit(bondingShareV2, "TransferSingle")
    .withArgs(bonding.address, ethers.constants.AddressZero, signerAdr, id, 1)
    .and.to.emit(bondingV2, "Deposit")
    .withArgs(signerAdr, id, amount, multiplier, duration, endBlock);

  // 1 week = blockCountInAWeek blocks

  const bond: BigNumber = await bondingShareV2.balanceOf(signerAdr, id);

  return { id, bond };
};

// withdraw bonding shares of ID belonging to the signer and return the
// bonding share balance of the signer
async function removeLiquidity(
  signer: Signer,
  id: BigNumber,
  amount: BigNumber
): Promise<BigNumber> {
  const signerAdr = await signer.getAddress();
  const bondAmount: BigNumber = await bondingShare.balanceOf(signerAdr, id);
  expect(bondAmount).to.equal(1);
  const bs = await masterChefV2.getBondingShareInfo(id);
  const bond = await bondingShareV2.getBond(id);
  const sharesToRemove = await bondingFormulas.sharesForLP(bond, bs, amount);
  const pendingLpReward = await bondingV2.lpRewardForShares(
    sharesToRemove,
    bond.lpRewardDebt
  );

  await expect(bondingV2.connect(signer).removeLiquidity(amount, id))
    .to.emit(bondingV2, "RemoveLiquidityFromBond")
    .withArgs(signerAdr, id, amount.add(pendingLpReward), sharesToRemove);
  return metaPool.balanceOf(signerAdr);
}

async function bondingSetup(): Promise<{
  crvToken: ERC20;
  curveWhale: Signer;
  admin: Signer;
  secondAccount: Signer;
  thirdAccount: Signer;
  fourthAccount: Signer;
  treasury: Signer;
  bondingMaxAccount: Signer;
  bondingMinAccount: Signer;
  bondingFormulas: BondingFormulas;
  curvePoolFactory: ICurveFactory;
  uAD: UbiquityAlgorithmicDollar;
  uGOV: UbiquityGovernance;
  metaPool: IMetaPool;
  bonding: Bonding;
  masterChef: MasterChef;
  bondingV2: BondingV2;
  masterChefV2: MasterChefV2;
  bondingShare: BondingShare;
  bondingShareV2: BondingShareV2;
  twapOracle: TWAPOracle;
  ubiquityFormulas: UbiquityFormulas;
  sablier: string;
  DAI: string;
  USDC: string;
  manager: UbiquityAlgorithmicDollarManager;
  blockCountInAWeek: BigNumber;
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
  [
    admin,
    secondAccount,
    thirdAccount,
    treasury,
    fourthAccount,
    bondingMaxAccount,
    bondingMinAccount,
  ] = await ethers.getSigners();
  adminAddress = await admin.getAddress();
  secondAddress = await secondAccount.getAddress();
  const fourthAddress = await fourthAccount.getAddress();
  const bondingMaxAccountAddress = await bondingMaxAccount.getAddress();
  const bondingMinAccountAddress = await bondingMinAccount.getAddress();

  const UBQ_MINTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
  );
  const UBQ_BURNER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_BURNER_ROLE")
  );
  // DEPLOY UbiquityAlgorithmicDollarManager Contract
  manager = (await (
    await ethers.getContractFactory("UbiquityAlgorithmicDollarManager")
  ).deploy(adminAddress)) as UbiquityAlgorithmicDollarManager;

  // DEPLOY Ubiquity library
  ubiquityFormulas = (await (
    await ethers.getContractFactory("UbiquityFormulas")
  ).deploy()) as UbiquityFormulas;
  await manager.setFormulasAddress(ubiquityFormulas.address);

  // DEPLOY Bonding Contract
  bonding = (await (
    await ethers.getContractFactory("Bonding")
  ).deploy(manager.address, sablier)) as Bonding;

  await bonding.setBlockCountInAWeek(420);
  blockCountInAWeek = await bonding.blockCountInAWeek();
  await manager.setBondingContractAddress(bonding.address);

  // DEPLOY BondingShare Contract
  bondingShare = (await (
    await ethers.getContractFactory("BondingShare")
  ).deploy(manager.address)) as BondingShare;
  await manager.setBondingShareAddress(bondingShare.address);
  // set bonding as operator for second account so that it can burn its bonding shares
  await bondingShare
    .connect(secondAccount)
    .setApprovalForAll(bonding.address, true);
  // set bonding as operator for admin account so that it can burn its bonding shares
  await bondingShare.setApprovalForAll(bonding.address, true);
  // set bonding as operator for third account so that it can burn its bonding shares
  await bondingShare
    .connect(thirdAccount)
    .setApprovalForAll(bonding.address, true);

  // DEPLOY UAD token Contract
  uAD = (await (
    await ethers.getContractFactory("UbiquityAlgorithmicDollar")
  ).deploy(manager.address)) as UbiquityAlgorithmicDollar;
  await manager.setDollarTokenAddress(uAD.address);
  // set treasury,uGOVFund and lpReward address needed for excessDollarsDistributor
  await manager.connect(admin).setTreasuryAddress(await treasury.getAddress());
  // DEPLOY UGOV token Contract
  uGOV = (await (
    await ethers.getContractFactory("UbiquityGovernance")
  ).deploy(manager.address)) as UbiquityGovernance;
  await manager.setGovernanceTokenAddress(uGOV.address);

  // GET 3CRV token contract
  crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;

  // GET curve factory contract
  // curvePoolFactory = (await ethers.getContractAt(
  //   "ICurveFactory",
  //   curveFactory
  // )) as ICurveFactory;

  // Mint 10000 uAD each for admin, second account and manager
  const mintings = [
    adminAddress,
    secondAddress,
    manager.address,
    fourthAddress,
    bondingMaxAccountAddress,
    bondingMinAccountAddress,
  ].map(
    async (signer: string): Promise<ContractTransaction> =>
      uAD.mint(signer, ethers.utils.parseEther("10000"))
  );
  await Promise.all(mintings);

  // Impersonate curve whale account
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [curveWhaleAddress],
  });
  curveWhale = ethers.provider.getSigner(curveWhaleAddress);

  // bonding should have the UBQ_MINTER_ROLE to mint bonding shares
  await manager.connect(admin).grantRole(UBQ_MINTER_ROLE, bonding.address);
  // bonding should have the UBQ_BURNER_ROLE to burn bonding shares
  await manager.connect(admin).grantRole(UBQ_BURNER_ROLE, bonding.address);

  // Mint uAD for whale
  await uAD.mint(curveWhaleAddress, ethers.utils.parseEther("10"));
  await crvToken
    .connect(curveWhale)
    .transfer(manager.address, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(curveWhale)
    .transfer(bondingMaxAccountAddress, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(curveWhale)
    .transfer(bondingMinAccountAddress, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(curveWhale)
    .transfer(fourthAddress, ethers.utils.parseEther("10000"));
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

  // TRANSFER some uLP tokens to bonding contract to simulate
  // the 80% premium from inflation
  await metaPool
    .connect(admin)
    .transfer(bonding.address, ethers.utils.parseEther("100"));

  // TRANSFER some uLP tokens to second account
  await metaPool
    .connect(admin)
    .transfer(secondAddress, ethers.utils.parseEther("1000"));

  // DEPLOY TWAPOracle Contract
  twapOracle = (await (
    await ethers.getContractFactory("TWAPOracle")
  ).deploy(metaPoolAddr, uAD.address, curve3CrvToken)) as TWAPOracle;
  await manager.setTwapOracleAddress(twapOracle.address);

  // DEPLOY MasterChef
  masterChef = (await (
    await ethers.getContractFactory("MasterChef")
  ).deploy(manager.address)) as MasterChef;
  await manager.setMasterChefAddress(masterChef.address);
  await manager.grantRole(UBQ_MINTER_ROLE, masterChef.address);

  const managerMasterChefAddress = await manager.masterChefAddress();
  expect(masterChef.address).to.be.equal(managerMasterChefAddress);

  curvePoolFactory = (await ethers.getContractAt(
    "ICurveFactory",
    curveFactory
  )) as ICurveFactory;

  // add liquidity to the metapool
  // accounts need to approve metaPool for sending its uAD and 3CRV
  await uAD
    .connect(bondingMinAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(bondingMinAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));
  await uAD
    .connect(bondingMaxAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(bondingMaxAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));
  await uAD
    .connect(fourthAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));
  await crvToken
    .connect(fourthAccount)
    .approve(metaPool.address, ethers.utils.parseEther("10000"));

  const dyuAD2LP = await metaPool["calc_token_amount(uint256[2],bool)"](
    [ethers.utils.parseEther("100"), ethers.utils.parseEther("100")],
    true
  );

  await metaPool
    .connect(bondingMinAccount)
    ["add_liquidity(uint256[2],uint256)"](
      [ethers.utils.parseEther("100"), ethers.utils.parseEther("100")],
      dyuAD2LP.mul(99).div(100)
    );
  await metaPool
    .connect(bondingMaxAccount)
    ["add_liquidity(uint256[2],uint256)"](
      [ethers.utils.parseEther("100"), ethers.utils.parseEther("100")],
      dyuAD2LP.mul(99).div(100)
    );
  await metaPool
    .connect(fourthAccount)
    ["add_liquidity(uint256[2],uint256)"](
      [ethers.utils.parseEther("100"), ethers.utils.parseEther("100")],
      dyuAD2LP.mul(99).div(100)
    );

  const bondingMinBalance = await metaPool.balanceOf(bondingMinAccountAddress);
  await bonding.connect(bondingMinAccount).deposit(bondingMinBalance, 1);
  const bondingMaxBalance = await metaPool.balanceOf(bondingMaxAccountAddress);
  await bonding.connect(bondingMaxAccount).deposit(bondingMaxBalance, 208);
  const bondingMaxIds = await bondingShare.holderTokens(
    bondingMaxAccountAddress
  );
  expect(bondingMaxIds.length).to.equal(1);
  const bsMaxAmount = await bondingShare.balanceOf(
    bondingMaxAccountAddress,
    bondingMaxIds[0]
  );
  const bondingMinIds = await bondingShare.holderTokens(
    bondingMinAccountAddress
  );
  expect(bondingMinIds.length).to.equal(1);
  const bsMinAmount = await bondingShare.balanceOf(
    bondingMinAccountAddress,
    bondingMinIds[0]
  );
  expect(bsMinAmount).to.be.lt(bsMaxAmount);

  // DEPLOY MasterChefV2
  masterChefV2 = (await (
    await ethers.getContractFactory("MasterChefV2")
  ).deploy(manager.address)) as MasterChefV2;
  await manager.setMasterChefAddress(masterChefV2.address);
  await manager.grantRole(UBQ_MINTER_ROLE, masterChefV2.address);

  const managerMasterChefV2Address = await manager.masterChefAddress();
  expect(masterChefV2.address).to.be.equal(managerMasterChefV2Address);

  // DEPLOY BondingShareV2 Contract
  bondingShareV2 = (await (
    await ethers.getContractFactory("BondingShareV2")
  ).deploy(manager.address)) as BondingShareV2;
  await manager.setBondingShareAddress(bondingShareV2.address);
  const managerBondingShareAddress = await manager.bondingShareAddress();
  expect(bondingShareV2.address).to.be.equal(managerBondingShareAddress);

  // DEPLOY Bonding Contract
  bondingFormulas = (await (
    await ethers.getContractFactory("BondingFormulas")
  ).deploy()) as BondingFormulas;

  bondingV2 = (await (
    await ethers.getContractFactory("BondingV2")
  ).deploy(
    manager.address,
    bondingFormulas.address,
    bonding.address,
    [bondingMinAccountAddress, bondingMaxAccountAddress],
    [bondingMinBalance, bondingMaxBalance],
    [1, 208]
  )) as BondingV2;

  await bondingV2.setBlockCountInAWeek(420);
  blockCountInAWeek = await bondingV2.blockCountInAWeek();
  await manager.setBondingContractAddress(bondingV2.address);

  return {
    curveWhale,
    masterChef,
    masterChefV2,
    bondingShareV2,
    bondingFormulas,
    bondingV2,
    admin,
    crvToken,
    secondAccount,
    thirdAccount,
    fourthAccount,
    bondingMaxAccount,
    bondingMinAccount,
    treasury,
    curvePoolFactory,
    uAD,
    uGOV,
    metaPool,
    bonding,
    bondingShare,
    twapOracle,
    ubiquityFormulas,
    sablier,
    DAI,
    USDC,
    manager,
    blockCountInAWeek,
  };
}

export { bondingSetup, deposit, removeLiquidity };
