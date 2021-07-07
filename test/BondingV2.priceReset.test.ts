import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetupV2 } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";

describe("price reset", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  let admin: Signer;
  let secondAccount: Signer;
  let treasury: Signer;
  let secondAddress: string;
  let uAD: UbiquityAlgorithmicDollar;
  let metaPool: IMetaPool;
  let crvToken: ERC20;
  let twapOracle: TWAPOracle;
  let bondingV2: BondingV2;
  let bondingShareV2: BondingShareV2;
  let sablier: string;

  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({
      secondAccount,
      uAD,
      metaPool,
      bondingV2,
      crvToken,
      bondingShareV2,
      sablier,
      blockCountInAWeek,
    } = await bondingSetupV2());
  });
  it("onlyBondingManager can call uADPriceReset  ", async () => {
    await expect(
      bondingV2.connect(secondAccount).uADPriceReset(1)
    ).to.be.revertedWith("not manager");
  });
  it("onlyBondingManager can call crvPriceReset  ", async () => {
    await expect(
      bondingV2.connect(secondAccount).crvPriceReset(1)
    ).to.be.revertedWith("not manager");
  });
  it("crvPriceReset should work", async () => {
    const bondingUADBalanceBefore = await uAD.balanceOf(bondingV2.address);
    const pool0bal0 = await metaPool.balances(0);
    const pool1bal0 = await metaPool.balances(1);
    expect(pool0bal0).to.equal(ethers.utils.parseEther("10000"));
    expect(pool1bal0).to.equal(ethers.utils.parseEther("10000"));

    const amountOf3CRVforOneUADBefore = await metaPool[
      "get_dy(int128,int128,uint256)"
    ](0, 1, ethers.utils.parseEther("1"));
    // deposit 100 uLP more tokens in addition to the 100 already in the bonding contract
    const idSecond = (await deposit(secondAccount, one.mul(100), 1)).id;
    const bondBefore = await bondingShare.balanceOf(secondAddress, idSecond);
    const bondingSCBalance = await metaPool.balanceOf(bonding.address);
    // value in LP of a bonding share
    const shareValueBefore = await bonding.currentShareValue();
    const bondingShareTotalSupply = await bondingShare.totalSupply();
    // amount of 3crv inside the treasury
    const treasuryAdr = await treasury.getAddress();
    const treasury3CRVBalanceBeforeReset = await crvToken.balanceOf(
      treasuryAdr
    );
    //  priceBOND = totalLP / totalShares * TARGET_PRICE
    const calculatedShareValue = bondingSCBalance
      .mul(one)
      .div(bondingShareTotalSupply);
    expect(shareValueBefore).to.equal(calculatedShareValue);
    const amountToTreasury = ethers.utils.parseEther("196.586734740380915533");
    await expect(bondingV2.crvPriceReset(bondingSCBalance))
      .to.emit(crvToken, "Transfer")
      .withArgs(bondingV2.address, treasuryAdr, amountToTreasury);
    const treasury3CRVBalanceAfterReset = await crvToken.balanceOf(treasuryAdr);
    expect(treasury3CRVBalanceAfterReset).to.equal(
      treasury3CRVBalanceBeforeReset.add(amountToTreasury)
    );
    const bondAfter = await bondingShare.balanceOf(secondAddress, idSecond);
    // bonding share should remain the same
    expect(bondBefore).to.equal(bondAfter);
    // amount of curve LP to be withdrawn should be less
    const shareValueAfter = await bonding.currentShareValue();

    const bondingSCBalanceAfter = await metaPool.balanceOf(bonding.address);
    expect(bondingSCBalanceAfter).to.equal(0);
    expect(shareValueAfter).to.equal(0);
    const bondingUADBalanceAfter = await uAD.balanceOf(bonding.address);

    const oraclePrice = await twapOracle.consult(uAD.address);
    const amountOf3CRVforOneUADAfter = await metaPool[
      "get_dy(int128,int128,uint256)"
    ](0, 1, ethers.utils.parseEther("1"));
    const oracleCRVPrice = await twapOracle.consult(crvToken.address);
    // price of uAD against 3CRV should be lower than before
    // meaning for a uAD you can have less  3CRV
    expect(amountOf3CRVforOneUADAfter).to.be.lt(amountOf3CRVforOneUADBefore);
    const pool0bal = await metaPool.balances(0);
    const pool1bal = await metaPool.balances(1);
    expect(bondingUADBalanceBefore).to.equal(0);
    expect(bondingUADBalanceAfter).to.equal(0);
    expect(pool1bal).to.equal(
      ethers.utils.parseEther("9803.393775449769704549")
    );
    expect(pool0bal).to.equal(ethers.utils.parseEther("10000"));
    await swapToUpdateOracle(metaPool, crvToken, uAD, admin);

    await twapOracle.update();
    const oraclePriceLatest = await twapOracle.consult(uAD.address);
    const oracleCRVPriceLatest = await twapOracle.consult(crvToken.address);
    // After update the TWAP price of uAD against 3CRV should be lower than before
    // the price of 3CRV against  price of uAD should be greater than before
    expect(oraclePriceLatest).to.be.lt(oraclePrice);
    expect(oracleCRVPriceLatest).to.be.gt(oracleCRVPrice);
  });
  it("crvPriceReset should work twice", async () => {});
  it("uADPriceReset should work", async () => {});
  it("uADPriceReset should work twice", async () => {});
});
