import { ContractTransaction, Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { resetFork } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ExcessDollarsDistributor } from "../artifacts/types/ExcessDollarsDistributor";

describe("ExcessDollarsDistributor", () => {
  let metaPool: IMetaPool;
  let manager: UbiquityAlgorithmicDollarManager;
  let admin: Signer;
  let secondAccount: Signer;
  let treasury: Signer;
  let bondingContractAdr: string;
  let bondingContract: Signer;
  let uAD: UbiquityAlgorithmicDollar;
  let crvToken: ERC20;
  let curveFactory: string;
  let curve3CrvBasePool: string;
  let curve3CrvToken: string;
  let curveWhaleAddress: string;
  let curveWhale: Signer;
  let treasuryAdr: string;
  let excessDollarsDistributor: ExcessDollarsDistributor;

  beforeEach(async () => {
    // list of accounts
    ({
      curveFactory,
      curve3CrvBasePool,
      curve3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [
      admin,
      secondAccount,
      treasury,
      bondingContract,
    ] = await ethers.getSigners();
    await resetFork(12150000);
    // deploy manager
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const UAD = await ethers.getContractFactory("UbiquityAlgorithmicDollar");
    uAD = (await UAD.deploy(manager.address)) as UbiquityAlgorithmicDollar;
    await manager.setuADTokenAddress(uAD.address);

    // set twap Oracle Address
    crvToken = (await ethers.getContractAt("ERC20", curve3CrvToken)) as ERC20;

    // to deploy the stableswap pool we need 3CRV and uAD
    // kindly ask a whale to give us some 3CRV
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });
    curveWhale = ethers.provider.getSigner(curveWhaleAddress);
    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));
    // just mint som uAD
    // mint 10000 uAD each for admin, manager and secondAccount
    const mintings = [await secondAccount.getAddress(), manager.address].map(
      async (signer): Promise<ContractTransaction> =>
        uAD.mint(signer, ethers.utils.parseEther("10000"))
    );
    await Promise.all(mintings);

    await manager.deployStableSwapPool(
      curveFactory,
      curve3CrvBasePool,
      crvToken.address,
      10,
      4000000
    );
    // setup the oracle
    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
    metaPool = (await ethers.getContractAt(
      "IMetaPool",
      metaPoolAddr
    )) as IMetaPool;

    const excessDollarsDistributorFactory = await ethers.getContractFactory(
      "ExcessDollarsDistributor"
    );
    excessDollarsDistributor = (await excessDollarsDistributorFactory.deploy(
      manager.address
    )) as ExcessDollarsDistributor;

    // set treasury,uGOV-UAD LP (TODO) and Bonding Cntract address needed for excessDollarsDistributor
    treasuryAdr = await treasury.getAddress();
    await manager.setTreasuryAddress(treasuryAdr);

    bondingContractAdr = await bondingContract.getAddress();
    await manager.setBondingContractAddress(bondingContractAdr);
  });
  it("distributeDollars should do nothing if total uAD is 0", async () => {
    await excessDollarsDistributor.distributeDollars();
    const treasuryBalance = await uAD.balanceOf(treasuryAdr);
    expect(treasuryBalance).to.equal(0);
  });

  it("distributeDollars should work", async () => {
    // simulate distribution of uAD to ExcessDollarDistributor
    const amount = ethers.utils.parseEther("100");
    const tenPercent = amount.mul(10).div(100);
    await uAD
      .connect(secondAccount)
      .transfer(excessDollarsDistributor.address, amount);
    let excessDollarBalance = await uAD.balanceOf(
      excessDollarsDistributor.address
    );
    expect(excessDollarBalance).to.equal(amount);
    // amount of LP token to send to bonding contract
    const dyuADto3CRV = await metaPool["get_dy(int128,int128,uint256)"](
      0,
      1,
      amount.sub(tenPercent).sub(tenPercent)
    );
    const dyuAD2LP = await metaPool["calc_token_amount(uint256[2],bool)"](
      [0, dyuADto3CRV],
      true
    );

    const LPInBondingBeforeDistribute = await metaPool.balanceOf(
      bondingContractAdr
    );
    expect(LPInBondingBeforeDistribute).to.equal(0);
    // distribute uAD
    await excessDollarsDistributor.distributeDollars();
    // 10% should go to the treasury
    const treasuryBalance = await uAD.balanceOf(treasuryAdr);
    expect(treasuryBalance).to.equal(tenPercent);
    // TODO Check that 10% goes to uGOV-UAD LP buyBack and burn

    // 80% of UAD should have been deposited as liquidity to curve and transfered
    // to the bonding contract
    // calculate the amount of LP token to receive

    // no CRV tokens should be left
    const crvBalanceAfterAddLiquidity = await crvToken.balanceOf(
      excessDollarsDistributor.address
    );
    expect(crvBalanceAfterAddLiquidity).to.equal(0);
    // no LP tokens should be left
    const LPBalAfterAddLiquidity = await metaPool.balanceOf(
      excessDollarsDistributor.address
    );
    expect(LPBalAfterAddLiquidity).to.equal(0);
    // all the LP should have been transfered to the bonding contract
    const eightyPercentAsLP = await metaPool.balanceOf(bondingContractAdr);

    expect(dyuAD2LP).to.be.lt(eightyPercentAsLP);
    // 99.9 % precise
    expect(dyuAD2LP).to.be.gt(eightyPercentAsLP.mul(999).div(1000));

    // make sure no uAD is left
    excessDollarBalance = await uAD.balanceOf(excessDollarsDistributor.address);
    expect(excessDollarBalance).to.equal(0);
  });
});
