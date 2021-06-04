import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAutoRedeem } from "../artifacts/types/UbiquityAutoRedeem";
import { DebtCoupon } from "../artifacts/types/DebtCoupon";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";

describe("UAR", () => {
  let manager: UbiquityAlgorithmicDollarManager;
  let uAR: UbiquityAutoRedeem;
  let admin: Signer;
  let secondAcc: Signer;
  let treasury: Signer;
  let debtCoupon: DebtCoupon;
  let uAD: UbiquityAlgorithmicDollar;

  beforeEach(async () => {
    // list of accounts
    [admin, secondAcc, treasury] = await ethers.getSigners();
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
    await manager.connect(admin).setDollarTokenAddress(uAD.address);
    await uAD.mint(await admin.getAddress(), ethers.utils.parseEther("10000"));
    // set treasury
    await manager
      .connect(admin)
      .setTreasuryAddress(await treasury.getAddress());

    // set debt coupon token
    const debtCouponFactory = await ethers.getContractFactory("DebtCoupon");
    debtCoupon = (await debtCouponFactory.deploy(
      manager.address
    )) as DebtCoupon;

    await manager.connect(admin).setDebtCouponAddress(debtCoupon.address);

    // deploy uAR
    const uARFactory = await ethers.getContractFactory("UbiquityAutoRedeem");
    uAR = (await uARFactory.deploy(manager.address)) as UbiquityAutoRedeem;
    await manager.setuARTokenAddress(uAR.address);
  });
  it("should revert if you call raise capital when not being a minter", async () => {
    await expect(uAR.connect(secondAcc).raiseCapital(100)).to.be.revertedWith(
      "Governance token: not minter"
    );
  });
  it("raise capital should mint UAR for the treasury", async () => {
    const treasuryAdr = await treasury.getAddress();
    const amount = BigNumber.from(1000);
    const balanceBefore = await uAR.balanceOf(treasuryAdr);
    await uAR.raiseCapital(amount);
    const balanceAfter = await uAR.balanceOf(treasuryAdr);

    expect(balanceAfter).to.equal(balanceBefore.add(amount));
  });
});
