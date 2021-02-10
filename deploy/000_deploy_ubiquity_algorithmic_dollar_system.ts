import { ethers, network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import CurveABI from "../test/Curve.json";
import { mineBlock } from "../test/utils/hardhatNode";

const deployFunc: DeployFunction = async ({ getNamedAccounts }) => {
  const [admin] = await ethers.getSigners();
  const {
    sablier,
    _3CrvToken,
    curveWhaleAddress,
    CurveFactory,
    _3CrvBasePool,
  } = await getNamedAccounts();

  const UbiquityAlgorithmicDollarManager = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollarManager",
    admin
  );
  const ubiquityAlgorithmicDollarManager = await UbiquityAlgorithmicDollarManager.deploy(
    admin.address
  );

  const BondingShare = await ethers.getContractFactory("BondingShare", admin);
  const bondingShare = await BondingShare.deploy();
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setBondingShareAddress(bondingShare.address);

  const Bonding = await ethers.getContractFactory("Bonding", admin);
  const bonding = await Bonding.deploy(
    ubiquityAlgorithmicDollarManager.address,
    sablier
  );
  await bondingShare
    .connect(admin)
    .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);

  const UAD = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollar",
    admin
  );
  const uAD = await UAD.deploy();
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setuADTokenAddress(uAD.address);
  await uAD
    .connect(admin)
    .mint(
      ubiquityAlgorithmicDollarManager.address,
      ethers.utils.parseEther("10000")
    );
  await uAD
    .connect(admin)
    .mint(admin.address, ethers.utils.parseEther("10000"));

  const crvToken = new ethers.Contract(_3CrvToken, CurveABI.abi);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [curveWhaleAddress],
  });

  const curveWhale = await ethers.provider.getSigner(curveWhaleAddress);

  await crvToken
    .connect(curveWhale)
    .transfer(
      ubiquityAlgorithmicDollarManager.address,
      ethers.utils.parseEther("10000")
    );
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .deployStableSwapPool(
      CurveFactory,
      _3CrvBasePool,
      crvToken.address,
      10,
      4000000
    );

  const metaPoolAddr = await ubiquityAlgorithmicDollarManager.stableSwapMetaPoolAddress();
  const TWAPOracle = await ethers.getContractFactory("TWAPOracle", admin);
  const twapOracle = await TWAPOracle.deploy(
    metaPoolAddr,
    _3CrvToken,
    uAD.address
  );
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setTwapOracleAddress(twapOracle.address);

  await twapOracle.connect(admin).update();
  let blockTimestamp =
    parseInt((await twapOracle.reservesBlockTimestampLast()).toString()) +
    23 * 3600;
  await mineBlock(blockTimestamp);
  await twapOracle.connect(admin).update();

  blockTimestamp =
    parseInt((await twapOracle.reservesBlockTimestampLast()).toString()) +
    23 * 3600;
  await mineBlock(blockTimestamp);
  await twapOracle.connect(admin).update();

  const DebtCoupon = await ethers.getContractFactory("DebtCoupon", admin);
  const debtCoupon = await DebtCoupon.deploy(
    ubiquityAlgorithmicDollarManager.address
  );
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setDebtCouponAddress(debtCoupon.address);

  const CouponsForDollarsCalculator = await ethers.getContractFactory(
    "CouponsForDollarsCalculator",
    admin
  );
  const couponsForDollarsCalculator = await CouponsForDollarsCalculator.deploy(
    ubiquityAlgorithmicDollarManager.address
  );
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setCouponCalculatorAddress(couponsForDollarsCalculator.address);

  const DebtCouponManager = await ethers.getContractFactory(
    "DebtCouponManager"
  );
  const debtCouponManager = await DebtCouponManager.deploy(
    ubiquityAlgorithmicDollarManager.address,
    ethers.BigNumber.from("1000000")
  );
};

export default deployFunc;
