import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { CurveUADIncentive } from "../artifacts/types/CurveUADIncentive";
import { BondingShare } from "../artifacts/types/BondingShare";
import { Bonding } from "../artifacts/types/Bonding";
import { IMetaPool } from "../artifacts/types/IMetaPool";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const [admin] = await ethers.getSigners();
  const couponLengthBlocks = 1110857;
  let curve3CrvToken = "";

  let curveFactory = "";
  let curve3CrvBasePool = "";
  // let ubq = "ubq.eth";
  ({ curve3CrvToken, curveFactory, curve3CrvBasePool } =
    await getNamedAccounts());
  deployments.log(
    `*****
  admin address :`,
    admin.address,
    `
  `
  );
  const opts = {
    from: admin.address,
    log: true,
  };
  const mgr = await deployments.deploy("UbiquityAlgorithmicDollarManager", {
    args: [admin.address],
    ...opts,
  });

  const mgrFactory = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollarManager"
  );

  const manager: UbiquityAlgorithmicDollarManager = mgrFactory.attach(
    mgr.address
  ) as UbiquityAlgorithmicDollarManager;

  deployments.log(
    `UbiquityAlgorithmicDollarManager deployed at:`,
    manager.address
  );
  // uAD
  const uADdeploy = await deployments.deploy("UbiquityAlgorithmicDollar", {
    args: [manager.address],
    ...opts,
  });
  const uadFactory = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollar"
  );

  const uAD: UbiquityAlgorithmicDollar = uadFactory.attach(
    uADdeploy.address
  ) as UbiquityAlgorithmicDollar;
  await manager.setuADTokenAddress(uAD.address);

  deployments.log("UbiquityAlgorithmicDollar deployed at:", uAD.address);
  // uGov
  const uGov = await deployments.deploy("UbiquityGovernance", {
    args: [manager.address],
    ...opts,
  });
  await manager.setuGOVTokenAddress(uGov.address);
  deployments.log("UbiquityGovernance deployed at:", uGov.address);
  // set twap Oracle Address

  const crvToken = (await ethers.getContractAt(
    "ERC20",
    curve3CrvToken
  )) as ERC20;
  deployments.log("crvToken deployed at:", crvToken.address);

  // set uAR for dollar Calculator
  const uARCalc = await deployments.deploy("UARForDollarsCalculator", {
    args: [manager.address],
    ...opts,
  });
  await manager.setUARCalculatorAddress(uARCalc.address);
  deployments.log("uAR for dollar Calculator deployed at:", uARCalc.address);

  // set coupon for dollar Calculator
  const couponsForDollarsCalculator = await deployments.deploy(
    "CouponsForDollarsCalculator",
    {
      args: [manager.address],
      ...opts,
    }
  );
  await manager.setCouponCalculatorAddress(couponsForDollarsCalculator.address);
  deployments.log(
    "coupons for dollar Calculator deployed at:",
    couponsForDollarsCalculator.address
  );
  // set Dollar Minting Calculator
  const dollarMintingCalculator = await deployments.deploy(
    "DollarMintingCalculator",
    {
      args: [manager.address],
      ...opts,
    }
  );
  await manager.setDollarMintingCalculatorAddress(
    dollarMintingCalculator.address
  );
  deployments.log(
    "dollar minting Calculator deployed at:",
    dollarMintingCalculator.address
  );
  // set debt coupon token

  const debtCoupon = await deployments.deploy("DebtCoupon", {
    args: [manager.address],
    ...opts,
  });
  await manager.setDebtCouponAddress(debtCoupon.address);
  deployments.log("debt coupon deployed at:", debtCoupon.address);
  const debtCouponMgr = await deployments.deploy("DebtCouponManager", {
    args: [manager.address, couponLengthBlocks],
    ...opts,
  });
  deployments.log("debt coupon manager deployed at:", debtCouponMgr.address);
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
  await manager.grantRole(COUPON_MANAGER_ROLE, debtCouponMgr.address);
  deployments.log("debt coupon manager has been granted COUPON_MANAGER_ROLE");
  await manager.grantRole(UBQ_MINTER_ROLE, debtCouponMgr.address);
  deployments.log("debt coupon manager has been granted UBQ_MINTER_ROLE");
  await manager.grantRole(UBQ_BURNER_ROLE, debtCouponMgr.address);
  deployments.log("debt coupon manager has been granted UBQ_BURNER_ROLE");
  // to calculate the totalOutstanding debt we need to take into account autoRedeemToken.totalSupply
  const uAR = await deployments.deploy("UbiquityAutoRedeem", {
    args: [manager.address],
    ...opts,
  });

  await manager.setuARTokenAddress(uAR.address);
  deployments.log("ubiquity auto redeem deployed at:", uAR.address);
  // when the debtManager mint uAD it there is too much it distribute the excess to
  const excessDollarsDistributor = await deployments.deploy(
    "ExcessDollarsDistributor",
    {
      args: [manager.address],
      ...opts,
    }
  );

  await manager
    .connect(admin)
    .setExcessDollarsDistributor(
      debtCouponMgr.address,
      excessDollarsDistributor.address
    );

  deployments.log(
    "excess dollars distributor deployed at:",
    excessDollarsDistributor.address
  );
  // set treasury,uGOVFund and lpReward address needed for excessDollarsDistributor
  await manager.setTreasuryAddress(admin.address);
  deployments.log("treasury is equal to admin was  set at:", admin.address);
  // DEPLOY BondingShare Contract
  const bondingShareDeploy = await deployments.deploy("BondingShare", {
    args: [manager.address],
    ...opts,
  });
  const bondingShareFactory = await ethers.getContractFactory("BondingShare");
  const bondingShare: BondingShare = bondingShareFactory.attach(
    bondingShareDeploy.address
  ) as BondingShare;

  await manager.setBondingShareAddress(bondingShare.address);
  deployments.log("bondingShare deployed at:", bondingShare.address);
  // DEPLOY Ubiquity library
  const ubiquityFormulas = await deployments.deploy("UbiquityFormulas", opts);
  await manager.setFormulasAddress(ubiquityFormulas.address);
  deployments.log("ubiquity formulas deployed at:", bondingShare.address);
  // bonding
  const bondingDeploy = await deployments.deploy("Bonding", {
    args: [manager.address, ethers.constants.AddressZero],
    ...opts,
  });
  const bondingFactory = await ethers.getContractFactory("Bonding");
  const bonding: Bonding = bondingFactory.attach(
    bondingDeploy.address
  ) as Bonding;

  // bonding should have the UBQ_MINTER_ROLE to mint bonding shares
  await manager.grantRole(UBQ_MINTER_ROLE, bonding.address);
  // bonding should have the UBQ_BURNER_ROLE to burn bonding shares
  await manager.grantRole(UBQ_BURNER_ROLE, bonding.address);

  await bonding.setBlockCountInAWeek(420);
  await manager.setBondingContractAddress(bonding.address);
  deployments.log("bonding deployed at:", bonding.address);
  // incentive
  const curveIncentiveDeploy = await deployments.deploy("CurveUADIncentive", {
    args: [manager.address],
    ...opts,
  });
  const incentiveFactory = await ethers.getContractFactory("CurveUADIncentive");

  const curveIncentive: CurveUADIncentive = incentiveFactory.attach(
    curveIncentiveDeploy.address
  ) as CurveUADIncentive;
  deployments.log("curveIncentive deployed at:", curveIncentive.address);
  // turn off Sell Penalty
  await curveIncentive.switchSellPenalty();
  deployments.log(
    "curveIncentive SELL penalty activate:",
    await curveIncentive.isSellPenaltyOn()
  );
  deployments.log(
    "curveIncentive BUY penalty activate:",
    await curveIncentive.isBuyIncentiveOn()
  );

  // curveIncentive should have the UBQ_BURNER_ROLE to burn uAD during incentive
  await manager.grantRole(UBQ_BURNER_ROLE, curveIncentive.address);
  deployments.log("curveIncentive has been granted UBQ_BURNER_ROLE");
  // curveIncentive should have the UBQ_MINTER_ROLE to mint uGOV during incentive
  await manager.grantRole(UBQ_MINTER_ROLE, curveIncentive.address);
  deployments.log("curveIncentive has been granted UBQ_MINTER_ROLE");

  const net = await ethers.provider.getNetwork();
  deployments.log(`Current chain ID: ${net.chainId}`);
  /** TO BE REMOVED FOR MAINNET */
  // we should transfer 3CRV manually to the manager contract
  // kindly ask a whale to give us some 3CRV
  // if (net.chainId === 31337) {
  // hardhat local
  /* await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    const curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000")); */

  await uAD.mint(manager.address, ethers.utils.parseEther("10"));
  deployments.log(`10 uAD were minted for the manager`);

  // deploy the stableswap pool we need 3CRV and uAD
  await manager.deployStableSwapPool(
    curveFactory,
    curve3CrvBasePool,
    crvToken.address,
    10,
    4000000
  );

  // setup the oracle
  const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
  deployments.log("metaPoolAddr deployed at:", metaPoolAddr);
  // Twap
  const twapOracle = await deployments.deploy("TWAPOracle", {
    args: [metaPoolAddr, uAD.address, curve3CrvToken],
    ...opts,
  });
  deployments.log("twapOracle deployed at:", twapOracle.address);
  await manager.connect(admin).setTwapOracleAddress(twapOracle.address);
  // set the incentive contract to act upon transfer from and to the curve pool
  await manager.setIncentiveToUAD(metaPoolAddr, curveIncentive.address);
  // DEPLOY MasterChef
  const masterChef = await deployments.deploy("MasterChef", {
    args: [manager.address],
    ...opts,
  });
  await manager.setMasterChefAddress(masterChef.address);
  deployments.log("masterChef deployed at:", masterChef.address);
  await manager.grantRole(UBQ_MINTER_ROLE, masterChef.address);
  deployments.log("masterChef has been granted UBQ_MINTER_ROLE");

  // get some token for the faucet to the admin
  await uAD.mint(admin.address, ethers.utils.parseEther("10000"));
  /* await crvToken
    .connect(curveWhale)
    .transfer(admin.address, ethers.utils.parseEther("20000")); */
  deployments.log(`
  ***
  10000 uAD were minted for the treasury aka admin ${admin.address}
  don't forget to add liquidity to metapool:${metaPoolAddr} with these uAD
  first you need to call approve on uAD:${uAD.address} and crvToken:${crvToken.address}
  then call metaPool["add_liquidity(uint256[2],uint256)"] or go through crv.finance
  ***
  `);
  const metaPool = (await ethers.getContractAt(
    "IMetaPool",
    metaPoolAddr
  )) as IMetaPool;
  await uAD.approve(metaPoolAddr, ethers.utils.parseEther("10000"));
  await crvToken.approve(metaPoolAddr, ethers.utils.parseEther("10000"));
  deployments.log(`
  ***
  approve was called for admin on uAD:${uAD.address} and crvToken:${crvToken.address}
  for 10k uad and 10k 3crv
  don't forget to add liquidity to metapool:${metaPoolAddr} with these uAD and 3CRV
  either call metaPool["add_liquidity(uint256[2],uint256)"] or go through crv.finance
  ***
  `);
  /*   await metaPool["add_liquidity(uint256[2],uint256)"](
    [ethers.utils.parseEther("10000"), ethers.utils.parseEther("10000")],
    0
  ); */
  const uADBal = await uAD.balanceOf(admin.address);
  const crvBal = await crvToken.balanceOf(admin.address);
  const lpBal = await metaPool.balanceOf(admin.address);
  deployments.log(`
    ****
    Faucet charged
    uAD:${ethers.utils.formatEther(uADBal)}
    3crv:${ethers.utils.formatEther(crvBal)}
    uAD-3CRV LP:${ethers.utils.formatEther(lpBal)}
    UbiquityAlgorithmicDollarManager deployed at:${manager.address}
    uAD deployed at:${uAD.address}
    uAD-3CRV metapool deployed at:${metaPoolAddr}
    3crv deployed at:${crvToken.address}
    `);
  deployments.log(`
    ****
   We know need to deploy the UAD UGOV SushiPool
    `);
  //  }

  // setSushiSwapPoolAddress
  // await deployUADUGOVSushiPool(thirdAccount);
};
export default func;
func.tags = ["UbiquityAlgorithmicDollarManager"];
