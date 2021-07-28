import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { Bonding } from "../artifacts/types/Bonding";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { BondingFormulas } from "../artifacts/types/BondingFormulas";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { mineNBlock, resetFork } from "../test/utils/hardhatNode";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;

  // MIGRATION
  const toMigrateOriginals = [
    "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d",
    "0x10693e86f2e7151b3010469e33b6c1c2da8887d6",
    "0xa53a6fe2d8ad977ad926c485343ba39f32d3a3f6",
    "0x7c76f4db70b7e2177de10de3e2f668dadcd11108",
    "0x4007ce2083c7f3e18097aeb3a39bb8ec149a341d",
    "0x0709b103d46d71458a71e5d81230dd688809a53d",
    "0xf6501068a54f3eab46c1f145cb9d3fb91658b220",
    "0xd028babbdc15949aaa35587f95f9e96c7d49417d",
    "0xa1c7bd2e48f7f3922e201705f3491c841135f483",
    "0x9968efe1424d802e1f79fd8af8da67b0f08c814d",
  ];
  const toMigrateLpBalances = [
    "1000000000000000",
    "74603879373206473097231",
    "618000000000000000000",
    "374850000000000000000",
    "1878674425540571814543",
    "44739174270101943975392",
    "74603879373206473097231",
    "618000000000000000000",
    "374850000000000000000",
    "1878674425540571814543",
  ];
  const toMigrateWeeks = [
    "1",
    "100",
    "100",
    "11",
    "1",
    "100",
    "208",
    "208",
    "208",
    "4",
  ];

  let ubq = "";
  let tester = "";
  ({ ubq, tester } = await getNamedAccounts());
  /**
   *  hardhat local
   *  */
  await resetFork(12903140);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ubq],
  });

  const ubqAccount = ethers.provider.getSigner(ubq);
  const ubqAdr = await ubqAccount.getAddress();
  deployments.log(
    `*****
    ubqAdr address :`,
    ubqAdr,
    `
  `
  );
  const [admin] = await ethers.getSigners();
  const adminAdr = admin.address;
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

  const PAUSER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("PAUSER_ROLE")
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
    "image": "https://ubq.fi/image/logos/april-2021/jpg/ubq-logo-waves.jpg"
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
  /* */
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
  const bondingFactory = await ethers.getContractFactory("Bonding");
  const metaPoolAddr = await manager.connect(admin).stableSwapMetaPoolAddress();
  const metaPool = (await ethers.getContractAt(
    "IMetaPool",
    metaPoolAddr
  )) as IMetaPool;

  const bondingLPBal = await metaPool.balanceOf(currentBondingAdr);
  deployments.log("bondingLPBal :", ethers.utils.formatEther(bondingLPBal));
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
  const isUBQPauser = await manager
    .connect(ubqAccount)
    .hasRole(PAUSER_ROLE, ubqAdr);
  deployments.log("UBQ Is pauser ?:", isUBQPauser);

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

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [tester],
  });
  const testAccount = ethers.provider.getSigner(tester);
  const idsBefore = await bondingShareV2.holderTokens(tester);
  deployments.log("idsBefore:", idsBefore);
  const testerLPBalBeforeMigrate = await metaPool.balanceOf(tester);
  const totalLpToMigrateBeforeMigrate = await bondingV2.totalLpToMigrate();
  tx = await bondingV2.connect(testAccount).migrate();
  await tx.wait();
  const totalLpToMigrateAfterMigrate = await bondingV2.totalLpToMigrate();
  const idsAfter = await bondingShareV2.holderTokens(tester);
  const testerLPRewardsAfterMigrate = await bondingV2.pendingLpRewards(
    idsAfter[0]
  );
  deployments.log("idsAfter:", idsAfter[0].toNumber());
  const bond = await bondingShareV2.getBond(idsAfter[0]);
  deployments.log(`bond id:${idsAfter[0].toNumber()}
           minter:${bond.minter}
           lpAmount:${ethers.utils.formatEther(bond.lpAmount)}
           lpFirstDeposited:${ethers.utils.formatEther(bond.lpFirstDeposited)}
           endBlock:${bond.endBlock.toNumber()}
           tx:${tx.blockNumber.toString()}
  `);

  const pendingUGOV = await masterChefV2.pendingUGOV(idsAfter[0]);
  const bondingShareInfo = await masterChefV2.getBondingShareInfo(idsAfter[0]);
  deployments.log(`pendingUGOV :${ethers.utils.formatEther(pendingUGOV)}
  bondingShareInfo-0 :${ethers.utils.formatEther(bondingShareInfo[0])}
  bondingShareInfo-1 :${ethers.utils.formatEther(bondingShareInfo[1])}
`);
  const ubqBalBefore = await ubiquityGovernance.balanceOf(tester);
  await mineNBlock(blockCountInAWeek.toNumber());

  const pendingUGOV2 = await masterChefV2.pendingUGOV(idsAfter[0]);
  const bondingShareInfo2 = await masterChefV2.getBondingShareInfo(idsAfter[0]);
  deployments.log(`pendingUGOV2 :${ethers.utils.formatEther(pendingUGOV2)}
  bondingShareInfo2-0 :${ethers.utils.formatEther(bondingShareInfo2[0])}
  bondingShareInfo2-1 :${ethers.utils.formatEther(bondingShareInfo2[1])}
`);
  tx = await masterChefV2.connect(testAccount).getRewards(idsAfter[0]);
  await tx.wait();
  const ubqBalAfter = await ubiquityGovernance.balanceOf(tester);
  deployments.log(`
  ubqBalBefore  :${ethers.utils.formatEther(ubqBalBefore)}
  ubqBalAfter  :${ethers.utils.formatEther(ubqBalAfter)}
`);
  tx = await bondingV2
    .connect(testAccount)
    .removeLiquidity(bond.lpAmount, idsAfter[0]);
  await tx.wait();
  const testerLPRewardsAfterRemove = await bondingV2.pendingLpRewards(
    idsAfter[0]
  );
  deployments.log(`
  testerLPRewardsAfterMigrate  :${ethers.utils.formatEther(
    testerLPRewardsAfterMigrate
  )}
  testerLPRewardsAfterRemove  :${ethers.utils.formatEther(
    testerLPRewardsAfterRemove
  )}
`);
  const testerLPBalAfterMigrate = await metaPool.balanceOf(tester);
  deployments.log(`
  LPBalBefore  :${ethers.utils.formatEther(testerLPBalBeforeMigrate)}
  LPBalAfter  :${ethers.utils.formatEther(testerLPBalAfterMigrate)}
`);
  deployments.log(`
totalLpToMigrateBeforeMigrate  :${ethers.utils.formatEther(
    totalLpToMigrateBeforeMigrate
  )}
totalLpToMigrateAfterMigrate  :${ethers.utils.formatEther(
    totalLpToMigrateAfterMigrate
  )}
`);

  deployments.log(`
    That's all folks !
    `);
};
export default func;
func.tags = ["V2Test"];
