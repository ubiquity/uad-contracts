import { BigNumber, Signer } from "ethers";
import { ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { Big } from "big.js";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { MockuADToken } from "../artifacts/types/MockuADToken";
import { MockTWAPOracle } from "../artifacts/types/MockTWAPOracle";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";

describe("DollarMintingCalculator", () => {
  let metaPoolAddr: string;
  let curve3CrvToken: string;
  let manager: UbiquityAlgorithmicDollarManager;
  let twapOracle: MockTWAPOracle;
  let dollarMintingCalculator: DollarMintingCalculator;
  let admin: Signer;
  let uAD: MockuADToken;
  // to have decent precision
  Big.DP = 35;
  // to avoid exponential notation
  Big.PE = 55;
  Big.NE = -35;
  const setup = async (
    uADTotalSupply: BigNumber,
    priceUAD: BigNumber,
    price3CRV: BigNumber
  ) => {
    // set uAD Mock
    const UAD = await ethers.getContractFactory("MockuADToken");
    uAD = (await UAD.deploy(uADTotalSupply)) as MockuADToken;

    await manager.setuADTokenAddress(uAD.address);
    // set TWAP Oracle Mock

    const TWAPOracleFactory = await ethers.getContractFactory("MockTWAPOracle");
    twapOracle = (await TWAPOracleFactory.deploy(
      metaPoolAddr,
      uAD.address,
      curve3CrvToken,
      priceUAD,
      price3CRV
    )) as MockTWAPOracle;

    await manager.setTwapOracleAddress(twapOracle.address);
  };
  const calcDollarsToMint = (uADTotalSupply: Big, twapPrice: Big): Big => {
    const one = new Big(ethers.utils.parseEther("1").toString());
    return twapPrice.sub(one).mul(uADTotalSupply);
  };
  beforeEach(async () => {
    ({ curve3CrvToken } = await getNamedAccounts());
    // list of accounts
    [admin] = await ethers.getSigners();
    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    // setup the oracle
    metaPoolAddr = await manager.stableSwapMetaPoolAddress();

    // set Dollar Minting Calculator
    const dollarMintingCalculatorFactory = await ethers.getContractFactory(
      "DollarMintingCalculator"
    );
    dollarMintingCalculator = (await dollarMintingCalculatorFactory.deploy(
      manager.address
    )) as DollarMintingCalculator;
    await manager.setDollarCalculatorAddress(dollarMintingCalculator.address);
  });

  it("getDollarsToMint should work with price equal to 1$", async () => {
    const totSupply = ethers.utils.parseEther("10000");
    const uadPrice = ethers.utils.parseEther("1");
    await setup(totSupply, uadPrice, uadPrice);
    const toMint = await dollarMintingCalculator.getDollarsToMint();
    const calculatedToMint = calcDollarsToMint(
      new Big(totSupply.toString()),
      new Big(uadPrice.toString())
    );
    expect(toMint).to.equal(calculatedToMint.toString());
  });
  it("getDollarsToMint should work with price above 1$", async () => {
    const totSupply = ethers.utils.parseEther("10000");
    const uadPrice = ethers.utils.parseEther("1.054678911145683254");
    await setup(totSupply, uadPrice, uadPrice);
    const toMint = await dollarMintingCalculator.getDollarsToMint();
    const calculatedToMint = calcDollarsToMint(
      new Big(totSupply.toString()),
      new Big(uadPrice.toString())
    );
    expect(toMint).to.equal(calculatedToMint.toString());
  });
  it("getDollarsToMint should revert for overflow due to large supply", async () => {
    const totSupply = BigNumber.from(
      "15454897894564354597575465465465654654654654654654654555555555551"
    );
    const uadPrice = ethers.utils.parseEther("1.545489789456435457");
    await setup(totSupply, uadPrice, uadPrice);
    // check tfor overflow revert
    await expect(dollarMintingCalculator.getDollarsToMint()).to.be.reverted;
  });
});
