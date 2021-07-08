import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { DebtCouponManager } from "../artifacts/types/DebtCouponManager";
import { CouponsForDollarsCalculator } from "../artifacts/types/CouponsForDollarsCalculator";
import { UARForDollarsCalculator } from "../artifacts/types/UARForDollarsCalculator";
import { UbiquityAutoRedeem } from "../artifacts/types/UbiquityAutoRedeem";
import { DollarMintingCalculator } from "../artifacts/types/DollarMintingCalculator";
import { ExcessDollarsDistributor } from "../artifacts/types/ExcessDollarsDistributor";
import { bondingSetupV2, deposit } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import { swap3CRVtoUAD } from "./utils/swap";
import { isAmountEquivalent } from "./utils/calc";

describe("deposit", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  let admin: Signer;
  let debtCouponMgr: DebtCouponManager;
  let secondAccount: Signer;
  let fourthAccount: Signer;
  let secondAddress: string;
  let couponsForDollarsCalculator: CouponsForDollarsCalculator;
  let manager: UbiquityAlgorithmicDollarManager;
  let twapOracle: TWAPOracle;
  let debtCoupon: DebtCoupon;
  let thirdAccount: Signer;
  let treasury: Signer;
  let lpReward: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;
  let uAR: UbiquityAutoRedeem;
  let crvToken: ERC20;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let curveWhale: Signer;
  let dollarMintingCalculator: DollarMintingCalculator;
  let uarForDollarsCalculator: UARForDollarsCalculator;
  let excessDollarsDistributor: ExcessDollarsDistributor;
  let metaPool: IMetaPool;
  let bondingV2: BondingV2;
  let bondingShareV2: BondingShareV2;
  let masterChefV2: MasterChefV2;

  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({
      secondAccount,
      admin,
      fourthAccount,
      uAD,
      metaPool,
      bondingV2,
      masterChefV2,
      debtCouponMgr,
      uAR,
      crvToken,
      bondingShareV2,
      twapOracle,
      blockCountInAWeek,
    } = await bondingSetupV2());
  });

  it("deposit should work", async () => {
    const { id, bsAmount, shares, creationBlock, endBlock } = await deposit(
      secondAccount,
      one.mul(100),
      1
    );
    expect(id).to.equal(0);
    expect(bsAmount).to.equal(1);
    const detail = await bondingShareV2.getBond(id);
    expect(detail.lpAmount).to.equal(one.mul(100));
    expect(detail.lpDeposited).to.equal(one.mul(100));
    expect(detail.minter).to.equal(await secondAccount.getAddress());
    expect(detail.lpRewardDebt).to.equal(0);
    expect(detail.creationBlock).to.equal(creationBlock);
    expect(detail.endBlock).to.equal(endBlock);
    const shareDetail = await masterChefV2.getBondingShareInfo(id);
    expect(shareDetail[0]).to.equal(shares);
    await mineNBlock(blockCountInAWeek.toNumber());
  });
  it("pendingLpRewards should increase after inflation ", async () => {
    console.log(
      `
      ---*-bonding lpRewards:${ethers.utils.formatEther(
        await bondingV2.lpRewards()
      )}

    `
    );
    const { id, bsAmount, shares, creationBlock, endBlock } = await deposit(
      secondAccount,
      one.mul(100),
      1
    );
    expect(id).to.equal(0);
    expect(bsAmount).to.equal(1);
    const detail = await bondingShareV2.getBond(id);
    expect(detail.lpAmount).to.equal(one.mul(100));
    expect(detail.lpDeposited).to.equal(one.mul(100));
    expect(detail.minter).to.equal(await secondAccount.getAddress());
    expect(detail.lpRewardDebt).to.equal(0);
    expect(detail.creationBlock).to.equal(creationBlock);
    expect(detail.endBlock).to.equal(endBlock);
    const shareDetail = await masterChefV2.getBondingShareInfo(id);
    expect(shareDetail[0]).to.equal(shares);
    // trigger a debt cycle
    const secondAccountAdr = await secondAccount.getAddress();
    console.log(`
    secondAccountAdr: ${secondAccountAdr}
    debtCouponMgr: ${debtCouponMgr.address}
    `);
    await expect(debtCouponMgr.connect(secondAccount).exchangeDollarsForUAR(1))
      .to.emit(uAR, "Transfer")
      .withArgs(ethers.constants.AddressZero, secondAccountAdr, 1);
    console.log(`
      exchangeDollarsForUAR
      `);
    let debtCyle = await debtCouponMgr.debtCycle();
    expect(debtCyle).to.be.true;
    // now we should push the price up to trigger the excess dollar minting
    const bal = await crvToken.balanceOf(await fourthAccount.getAddress());
    console.log(`
    bal:${ethers.utils.formatEther(bal)}
    `);

    /*  const bondingV2Balance = await metaPool.balanceOf(bondingV2.address);
      console.log(`
    bondingV2Balance:${ethers.utils.formatEther(bondingV2Balance)}
    `);
    await bondingV2.uADPriceReset(bondingV2Balance); */

    //  await swap3CRVtoUAD(metaPool, crvToken, one.mul(20000), fourthAccount);
    await swap3CRVtoUAD(metaPool, crvToken, one.mul(10000), fourthAccount);
    // await swap3CRVtoUAD(metaPool, crvToken, one.mul(30000), fourthAccount);
    await mineNBlock(blockCountInAWeek.toNumber());
    await swap3CRVtoUAD(metaPool, crvToken, one.mul(100), fourthAccount);
    await twapOracle.update();

    /* await metaPool["remove_liquidity_one_coin(uint256,int128,uint256)"](
      one,
      1,
      0
    ); */
    const lpTotalSupply = await metaPool.totalSupply();
    console.log(
      `  metaPool totalSupply : ${ethers.utils.formatEther(lpTotalSupply)} `
    );
    console.log(` twapOracle `);
    // Price must be below 1 to mint coupons
    const uADPrice = await twapOracle.consult(uAD.address);
    console.log(` uADPrice: ${ethers.utils.formatEther(uADPrice)}`);

    const bondingV2BalBefore = await metaPool.balanceOf(bondingV2.address);
    const uadTotalSupplyBefore = await uAD.totalSupply();
    await debtCouponMgr
      .connect(secondAccount)
      .burnAutoRedeemTokensForDollars(1);
    const bondingV2BalAfter = await metaPool.balanceOf(bondingV2.address);
    const uadTotalSupplyAfter = await uAD.totalSupply();
    console.log(`
    bondingV2BalBefore:${ethers.utils.formatEther(bondingV2BalBefore)}
    bondingV2BalAfter:${ethers.utils.formatEther(bondingV2BalAfter)}
    `);
    console.log(`
    uadTotalSupplyBefore:${ethers.utils.formatEther(uadTotalSupplyBefore)}
    uadTotalSupplyAfter:${ethers.utils.formatEther(uadTotalSupplyAfter)}
    `);
    debtCyle = await debtCouponMgr.debtCycle();
    expect(debtCyle).to.be.false;
    await twapOracle.update();
    const uADPriceAfter = await twapOracle.consult(uAD.address);
    console.log(` uADPriceAfter: ${ethers.utils.formatEther(uADPriceAfter)}`);
    const lpTotalSupplyAfter = await metaPool.totalSupply();
    expect(lpTotalSupplyAfter).to.be.gt(lpTotalSupply);
    console.log(
      `  metaPool totalSupply : ${ethers.utils.formatEther(
        lpTotalSupplyAfter
      )} `
    );
    const pendingLpRewards = await bondingV2.pendingLpRewards(id);
    console.log(
      ` pendingLpRewards of id:${id}: ${ethers.utils.formatEther(
        pendingLpRewards
      )}`
    );
    const lpRewards = await bondingV2.lpRewards();
    // lprewards has not been updated yet
    expect(lpRewards).to.equal(0);
    console.log(` lpRewards: ${ethers.utils.formatEther(lpRewards)}`);

    const accLpRewardPerShare = await bondingV2.accLpRewardPerShare();
    console.log(
      ` accLpRewardPerShare: ${ethers.utils.formatEther(accLpRewardPerShare)}`
    );

    const totalLP = await bondingShareV2.totalLP();
    console.log(` totalLP: ${ethers.utils.formatEther(totalLP)}`);
    console.log(`bs shares: ${ethers.utils.formatEther(shares)}`);
    expect(detail.lpAmount).to.equal(totalLP);
    // one BS gets all the shares and LP
    const totalShares = await masterChefV2.totalShares();
    console.log(`total shares: ${ethers.utils.formatEther(totalShares)}`);
    expect(shares).to.equal(totalShares);

    // another deposit should not get some lp rewards
    const ibond2 = await deposit(fourthAccount, one.mul(100), 1);
    expect(ibond2.id).to.equal(1);
    expect(ibond2.bsAmount).to.equal(1);
    console.log(`*** BEFORE pendingLpRewards1`);
    const pendingLpRewards1 = await bondingV2.pendingLpRewards(id);
    //now lprewards should have been updated
    const lpRewardsAfter2ndDeposit = await bondingV2.lpRewards();

    console.log(`***
    lpRewardsAfter2ndDeposit:${ethers.utils.formatEther(
      lpRewardsAfter2ndDeposit
    )}
    pendingLpRewards1       :${ethers.utils.formatEther(pendingLpRewards1)}`);
    // first user should get all the rewards

    const isPrecise = isAmountEquivalent(
      pendingLpRewards1.toString(),
      lpRewardsAfter2ndDeposit.toString(),
      "0.0000000001"
    );
    expect(isPrecise).to.be.true;
    // expect(toMint).not.to.equal(calculatedToMint);

    // expect(pendingLpRewards1).to.equal(lpRewardsAfter2ndDeposit);

    const pendingLpRewards2 = await bondingV2.pendingLpRewards(ibond2.id);
    // second user should get none of the previous rewards
    expect(pendingLpRewards2).to.equal(0);
    console.log(`*** pendingLpRewards2`);
    console.log(
      `
      bonding lp balance:${ethers.utils.formatEther(
        await metaPool.balanceOf(bondingV2.address)
      )}
      bonding lpRewards:${ethers.utils.formatEther(await bondingV2.lpRewards())}

      bondingshare total lp deposited:${ethers.utils.formatEther(
        await bondingShareV2.totalLP()
      )}
      pendingLpRewards1 of id:${id}: ${ethers.utils.formatEther(
        pendingLpRewards1
      )}
      pendingLpRewards2 of id:${ibond2.id}: ${ethers.utils.formatEther(
        pendingLpRewards2
      )}`
    );

    const detail2 = await bondingShareV2.getBond(ibond2.id);
    console.log(`
    detail2:${JSON.stringify(detail2)}
    lpRewardDebt: ${ethers.utils.formatEther(detail2.lpRewardDebt)}
    `);

    expect(detail2.lpAmount).to.equal(one.mul(100));
    expect(detail2.lpDeposited).to.equal(one.mul(100));
    expect(detail2.minter).to.equal(await fourthAccount.getAddress());
    expect(detail2.lpRewardDebt).to.equal(pendingLpRewards1);
    expect(detail2.creationBlock).to.equal(ibond2.creationBlock);
    expect(detail2.endBlock).to.equal(ibond2.endBlock);

    // lp amount should increase
    const totalLPAfter2ndDeposit = await bondingShareV2.totalLP();
    expect(totalLP.add(detail2.lpAmount)).to.equal(totalLPAfter2ndDeposit);
    // bs shares should increase
    const totalSharesAfter2ndDeposit = await masterChefV2.totalShares();
    expect(totalShares.add(ibond2.shares)).to.equal(totalSharesAfter2ndDeposit);
    // do a price reset
  });
});
