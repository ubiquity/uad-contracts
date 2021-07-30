import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { CurveUADIncentive } from "../artifacts/types/CurveUADIncentive";
import { BondingShare } from "../artifacts/types/BondingShare";
import { Bonding } from "../artifacts/types/Bonding";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { BondingFormulas } from "../artifacts/types/BondingFormulas";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { IUniswapV2Router02 } from "../artifacts/types/IUniswapV2Router02";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { IUniswapV2Pair } from "../artifacts/types/IUniswapV2Pair";
import pressAnyKey from "../utils/flow";
import { mineNBlock, resetFork } from "../test/utils/hardhatNode";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, ethers } = hre;

  // MIGRATION
  const toMigrateOriginals = [""];
  const toMigrateLpBalances = [""];
  const toMigrateWeeks = [""];

  const [ubqAccount] = await ethers.getSigners();
  const adminAdr = ubqAccount.address;
  deployments.log(
    `*****
    adminAdr address :`,
    adminAdr,
    `
  `
  );
  const opts = {
    from: adminAdr,
    log: true,
  };

  let mgrAdr = "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
  let bondingV2deployAddress = "";
  let bondingFormulasdeployAddress = "";
  let bondingShareV2deployAddress = "";
  let masterchefV2deployAddress = "";

  // calculate end locking period block number
  // 1 week = 45361 blocks = 2371753*7/366

  const UBQ_MINTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
  );
  const UBQ_BURNER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_BURNER_ROLE")
  );

  if (mgrAdr.length === 0) {
    const mgr = await deployments.deploy("UbiquityAlgorithmicDollarManager", {
      args: [adminAdr],
      ...opts,
    });
    mgrAdr = mgr.address;
  }

  const mgrFactory = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollarManager"
  );

  const manager: UbiquityAlgorithmicDollarManager = mgrFactory.attach(
    mgrAdr // mgr.address
  ) as UbiquityAlgorithmicDollarManager;

  const ubqFactory = await ethers.getContractFactory("UbiquityGovernance");
  const ubqGovAdr = "0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0";
  const ubiquityGovernance: UbiquityGovernance = ubqFactory.attach(
    ubqGovAdr
  ) as UbiquityGovernance;

  deployments.log(
    `UbiquityAlgorithmicDollarManager deployed at:`,
    manager.address
  );
  const currentBondingAdr = await manager.bondingContractAddress();
  deployments.log("current Bonding Adr :", currentBondingAdr);
  const currentMSAdr = await manager.masterChefAddress();
  deployments.log("current Masterchef Adr :", currentMSAdr);
  const ubqBalMS = await ubiquityGovernance.balanceOf(currentMSAdr);
  deployments.log(`
  current Masterchef UGOV Balance :${ethers.utils.formatEther(ubqBalMS)}
`);

  let tx = await manager
    .connect(ubqAccount)
    .revokeRole(UBQ_MINTER_ROLE, currentMSAdr);
  await tx.wait();
  tx = await manager
    .connect(ubqAccount)
    .revokeRole(UBQ_MINTER_ROLE, currentBondingAdr);
  await tx.wait();
  tx = await manager
    .connect(ubqAccount)
    .revokeRole(UBQ_BURNER_ROLE, currentBondingAdr);
  await tx.wait();

  const isMSMinter = await manager
    .connect(ubqAccount)
    .hasRole(UBQ_MINTER_ROLE, currentMSAdr);
  deployments.log("Master Chef Is minter ?:", isMSMinter);
  const isBSMinter = await manager
    .connect(ubqAccount)
    .hasRole(UBQ_MINTER_ROLE, currentBondingAdr);
  deployments.log("Bonding Is minter ?:", isBSMinter);

  // BondingShareV2
  const uri = `{
    "name": "Bonding Share",
    "description": "Ubiquity Bonding Share V2",
    "image": "https://bafybeifibz4fhk4yag5reupmgh5cdbm2oladke4zfd7ldyw7avgipocpmy.ipfs.infura-ipfs.io/"
  }`;
  if (bondingShareV2deployAddress.length === 0) {
    const bondingShareV2deploy = await deployments.deploy("BondingShareV2", {
      args: [manager.address, uri],
      ...opts,
    });

    bondingShareV2deployAddress = bondingShareV2deploy.address;
  }
  /* */
  const bondingShareV2Factory = await ethers.getContractFactory(
    "BondingShareV2"
  );

  const bondingShareV2: BondingShareV2 = bondingShareV2Factory.attach(
    bondingShareV2deployAddress
  ) as BondingShareV2;

  deployments.log("BondingShareV2 deployed at:", bondingShareV2.address);
  tx = await manager
    .connect(ubqAccount)
    .setBondingShareAddress(bondingShareV2.address);
  await tx.wait();
  const managerBondingShareAddress = await manager.bondingShareAddress();
  deployments.log(
    "BondingShareV2 in Manager is set to:",
    managerBondingShareAddress
  );

  // MasterchefV2
  if (masterchefV2deployAddress.length === 0) {
    const masterchefV2deploy = await deployments.deploy("MasterChefV2", {
      args: [manager.address],
      ...opts,
    });

    masterchefV2deployAddress = masterchefV2deploy.address;
  }

  const masterChefV2Factory = await ethers.getContractFactory("MasterChefV2");

  const masterChefV2: MasterChefV2 = masterChefV2Factory.attach(
    masterchefV2deployAddress
  ) as MasterChefV2;
  deployments.log("MasterChefV2 deployed at:", masterChefV2.address);
  tx = await manager
    .connect(ubqAccount)
    .setMasterChefAddress(masterChefV2.address);
  await tx.wait();
  tx = await manager
    .connect(ubqAccount)
    .grantRole(UBQ_MINTER_ROLE, masterChefV2.address);
  await tx.wait();
  const managerMasterChefV2Address = await manager.masterChefAddress();
  deployments.log(
    "masterChefAddress in Manager is set to:",
    managerMasterChefV2Address
  );
  // Bonding Formula

  if (bondingFormulasdeployAddress.length === 0) {
    const bondingFormulas = await deployments.deploy("BondingFormulas", {
      args: [],
      ...opts,
    });
    bondingFormulasdeployAddress = bondingFormulas.address;
  }

  const bondingFormulasFactory = await ethers.getContractFactory(
    "BondingFormulas"
  );

  const bf: BondingFormulas = bondingFormulasFactory.attach(
    bondingFormulasdeployAddress
  ) as BondingFormulas;
  deployments.log("BondingFormulas deployed at:", bf.address);
  // BondingV2

  deployments.log(
    "bondingFormulasdeployAddress :",
    bondingFormulasdeployAddress
  );
  deployments.log("manager.address :", manager.address);
  if (bondingV2deployAddress.length === 0) {
    const bondingV2deploy = await deployments.deploy("BondingV2", {
      args: [
        manager.address,
        bondingFormulasdeployAddress,
        toMigrateOriginals,
        toMigrateLpBalances,
        toMigrateWeeks,
      ],
      ...opts,
    });

    bondingV2deployAddress = bondingV2deploy.address;
  }
  deployments.log("bondingV2deployAddress :", bondingV2deployAddress);
  /* */
  const bondingV2Factory = await ethers.getContractFactory("BondingV2");

  const bondingV2: BondingV2 = bondingV2Factory.attach(
    bondingV2deployAddress
  ) as BondingV2;
  deployments.log("bondingV2 deployed at:", bondingV2.address);
  tx = await bondingV2.setMigrating(true);
  await tx.wait();
  deployments.log("setMigrating to true");
  // send the LP token from bonding V1 to V2 to prepare the migration

  const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
  const metaPool = (await ethers.getContractAt(
    "IMetaPool",
    metaPoolAddr
  )) as IMetaPool;

  const bondingLPBal = await metaPool.balanceOf(currentBondingAdr);
  deployments.log("bondingLPBal :", ethers.utils.formatEther(bondingLPBal));

  const bondingFactory = await ethers.getContractFactory("Bonding");
  const bonding: Bonding = bondingFactory.attach(currentBondingAdr) as Bonding;
  await bonding
    .connect(ubqAccount)
    .sendDust(bondingV2.address, metaPool.address, bondingLPBal);
  const bondingV2LPBal = await metaPool.balanceOf(bondingV2.address);
  deployments.log(
    "all bondingLPBal sent to bondingV2... bondingV2LPBal:",
    ethers.utils.formatEther(bondingV2LPBal)
  );
  // bondingV2 should have the UBQ_MINTER_ROLE to mint bonding shares

  tx = await manager
    .connect(ubqAccount)
    .grantRole(UBQ_MINTER_ROLE, bondingV2.address);
  await tx.wait();
  tx = await bondingV2.connect(ubqAccount).setBlockCountInAWeek(46550);
  await tx.wait();
  const blockCountInAWeek = await bondingV2.blockCountInAWeek();
  deployments.log("bondingV2 blockCountInAWeek:", blockCountInAWeek);
  tx = await manager
    .connect(ubqAccount)
    .setBondingContractAddress(bondingV2.address);
  await tx.wait();
  const managerBondingV2Address = await manager.bondingContractAddress();
  deployments.log("BondingV2 in Manager is set to:", managerBondingV2Address);

  const ismasterChefV2Minter = await manager
    .connect(ubqAccount)
    .hasRole(UBQ_MINTER_ROLE, masterChefV2.address);
  deployments.log("MasterChef V2 Is minter ?:", ismasterChefV2Minter);
  const isbondingShareV2Minter = await manager
    .connect(ubqAccount)
    .hasRole(UBQ_MINTER_ROLE, bondingV2.address);
  deployments.log("Bonding V2 Is minter ?:", isbondingShareV2Minter);

  // try to migrate test

  deployments.log(`
    That's all folks !
    `);
};
export default func;
func.tags = ["V2"];
