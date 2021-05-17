import { expect } from "chai";
import { Signer, BigNumber, ethers } from "ethers";
import { BondingShare } from "../artifacts/types/BondingShare";
import { bondingSetup, deposit } from "./BondingSetup";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { Bonding } from "../artifacts/types/Bonding";
import { ICurveFactory } from "../artifacts/types/ICurveFactory";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";

describe("Bonding.Price.Reset", () => {
  const one: BigNumber = BigNumber.from(10).pow(18);

  let secondAccount: Signer;
  let secondAddress: string;
  let bondingShare: BondingShare;
  let uAD: UbiquityAlgorithmicDollar;
  let bonding: Bonding;
  let metaPool: IMetaPool;
  let curvePoolFactory: ICurveFactory;

  before(async () => {
    ({ secondAccount, bondingShare, bonding, metaPool, uAD, curvePoolFactory } =
      await bondingSetup());
    secondAddress = await secondAccount.getAddress();
  });

  it("should work", async () => {
    const bondingUADBalanceBefore = await uAD.balanceOf(bonding.address);
    const pool0bal0 = await metaPool.balances(0);
    const pool1bal0 = await metaPool.balances(1);
    expect(pool0bal0).to.equal(ethers.utils.parseEther("10000"));
    expect(pool1bal0).to.equal(ethers.utils.parseEther("10000"));

    // deposit 100 uLP more tokens in addition to the 100 already in the bonding contract
    const idSecond = (await deposit(secondAccount, one.mul(100), 1)).id;
    const bondBefore = await bondingShare.balanceOf(secondAddress, idSecond);
    const bondingSCBalance = await metaPool.balanceOf(bonding.address);

    // value in LP of a bonding share
    const shareValueBefore = await bonding.currentShareValue();
    const bondingShareTotalSupply = await bondingShare.totalSupply();

    //  priceBOND = totalLP / totalShares * TARGET_PRICE
    const calculatedShareValue = bondingSCBalance
      .mul(one)
      .div(bondingShareTotalSupply);
    expect(shareValueBefore).to.equal(calculatedShareValue);

    await expect(bonding.priceReset(bondingSCBalance))
      .to.emit(uAD, "Burning")
      .withArgs(
        bonding.address,
        ethers.utils.parseEther("199.732180231372855561")
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

    const rates = await curvePoolFactory.get_rates(metaPool.address);
    expect(rates[0]).to.equal(ethers.utils.parseEther("1"));
    expect(rates[1]).to.equal(ethers.utils.parseEther("1.014953153764877573"));
    const pool0bal = await metaPool.balances(0);
    const pool1bal = await metaPool.balances(1);
    expect(bondingUADBalanceBefore).to.equal(0);
    expect(bondingUADBalanceAfter).to.equal(0);
    expect(pool0bal).to.equal(
      ethers.utils.parseEther("9800.247726144657311584")
    );
    expect(pool1bal).to.equal(ethers.utils.parseEther("10000"));
  });
  it("should revert if not admin", async () => {
    const bondingSCBalance = await metaPool.balanceOf(bonding.address);
    await expect(
      bonding.connect(secondAccount).priceReset(bondingSCBalance)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });
});
