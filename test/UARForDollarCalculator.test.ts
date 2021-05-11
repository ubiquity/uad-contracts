import { BigNumber, Signer } from "ethers";
import { ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { MockuADToken } from "../artifacts/types/MockuADToken";
import { UARForDollarsCalculator } from "../artifacts/types/UARForDollarsCalculator";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";
import { calcDollarsToMint, calcUARforDollar } from "./utils/calc";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";

describe("UARForDollarsCalculator", () => {
  let manager: UbiquityAlgorithmicDollarManager;
  let uARForDollarCalculator: UARForDollarsCalculator;
  let admin: Signer;
  let debtCoupon: DebtCoupon;
  let uAD: UbiquityAlgorithmicDollar;

  beforeEach(async () => {
    // list of accounts
    [admin] = await ethers.getSigners();
    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;
    // set ubiquity Dollar
    const uADFactory = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollar"
    );
    uAD = (await uADFactory.deploy(
      manager.address
    )) as UbiquityAlgorithmicDollar;
    await manager.connect(admin).setuADTokenAddress(uAD.address);
    await uAD.mint(await admin.getAddress(), ethers.utils.parseEther("10000"));
    // set debt coupon token
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      manager.address
    )) as DebtCoupon;

    await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);

    // set UAR Dollar Minting Calculator
    const dollarMintingCalculatorFactory = await ethers.getContractFactory(
      "UARForDollarsCalculator"
    );
    uARForDollarCalculator = (await dollarMintingCalculatorFactory.deploy(
      manager.address
    )) as UARForDollarsCalculator;
  });
  it("should have coef equal 1 after deployment", async () => {
    const coef = await uARForDollarCalculator.getConstant();
    console.log(`coefSC:${coef.toString()}`);
    expect(coef).to.equal(ethers.utils.parseEther("1"));
    await uARForDollarCalculator.setConstant(ethers.utils.parseEther("1"));
    const coef2 = await uARForDollarCalculator.getConstant();
    console.log(`coef2:${coef2.toString()}`);
    expect(coef).to.equal(coef2);
    await uARForDollarCalculator.setConstant(
      ethers.utils.parseEther("1.00012454654")
    );
    const coef3 = await uARForDollarCalculator.getConstant();
    console.log(`coef3:${coef3.toString()}`);
    expect(coef3).to.equal(ethers.utils.parseEther("1.00012454654"));
  });
  it("should calculate correctly with coef equal 1 ", async () => {
    const blockHeight = await ethers.provider.getBlockNumber();
    const dollarToBurn = ethers.utils.parseEther("1");
    const blockHeightDebt = blockHeight - 100;
    const coef = ethers.utils.parseEther("1");
    const uARMinted = await uARForDollarCalculator.getUARAmount(
      dollarToBurn,
      blockHeightDebt
    );
    const calculatedUARMinted = calcUARforDollar(
      dollarToBurn.toString(),
      blockHeightDebt.toString(),
      blockHeight.toString(),
      coef.toString()
    );
    console.log(`
    blockHeightDebt:${blockHeightDebt}
    blockHeight:${blockHeight}
    uARMinted:${ethers.utils.formatEther(uARMinted)}
    calculatedUARMinted:${ethers.utils.formatEther(calculatedUARMinted)}`);
    expect(uARMinted).to.equal(calculatedUARMinted);
  });
  it("should calculate correctly with coef > 1 ", async () => {
    const blockHeight = await ethers.provider.getBlockNumber();
    const dollarToBurn = ethers.utils.parseEther("14456");
    const blockHeightDebt = blockHeight - 24567;
    const coef = ethers.utils.parseEther("1.0164");
    const uARMinted = await uARForDollarCalculator.getUARAmount(
      dollarToBurn,
      blockHeightDebt
    );
    const calculatedUARMinted = calcUARforDollar(
      dollarToBurn.toString(),
      blockHeightDebt.toString(),
      blockHeight.toString(),
      coef.toString()
    );
    console.log(`
    blockHeightDebt:${blockHeightDebt}
    blockHeight:${blockHeight}
    uARMinted:${ethers.utils.formatEther(uARMinted)}
    calculatedUARMinted:${ethers.utils.formatEther(calculatedUARMinted)}`);
    expect(uARMinted).to.equal(calculatedUARMinted);
  });
});
