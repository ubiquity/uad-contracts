const { expect, use } = require("chai");
const { describe, it, before } = require("mocha");
const { ethers, deployments, waffle, getNamedAccounts } = require("hardhat");
const { BigNumber } = require("ethers");
const { smoddit } = require("@eth-optimism/smock");
const CurveFactoryABI = require("./CurveFactory.json");
const fs = require("fs").promises;

const provider = waffle.provider;
const { deploy } = deployments;
const { solidity } = waffle;
use(solidity);

describe("Bonding", () => {
  let bonding;
  let manager;
  let admin;
  let secondAccount;
  let sablier;
  let USDC;
  let DAI;
  let CurveFactory;
  let _3CrvBasePool;

  before(async () => {
    ({
      sablier,
      USDC,
      DAI,
      CurveFactory,
      _3CrvBasePool,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();

    const BondingShare = await deploy("BondingShare", {
      from: admin.address,
    });

    const bondingShare = new ethers.Contract(
      BondingShare.address,
      BondingShare.abi,
      provider
    );

    const Manager = await deploy("UbiquityAlgorithmicDollarManager", {
      from: admin.address,
      args: [admin.address],
    });
    manager = new ethers.Contract(Manager.address, Manager.abi, provider);

    await manager.connect(admin).setBondingShareAddress(bondingShare.address);

    const UAD = await smoddit("UbiquityAlgorithmicDollar", admin);
    const uAD = await UAD.deploy();

    await manager.connect(admin).setuADTokenAddress(uAD.address);

    uAD.smodify.put({
      _balances: {
        [secondAccount.address]: ethers.BigNumber.from("1000000"),
      },
    });

    // Need to use this hack for now because Hardhat still can't compile
    // Solidity and Vyper contracts in the same project
    await fs.copyFile("./test/Curve.json", "./artifacts/Curve.json");

    const CrvToken = await deploy("Curve", {
      from: admin.address,
      args: [
        "Curve.fi DAI/USDC/USDT",
        "3Crv",
        ethers.BigNumber.from("18"),
        ethers.BigNumber.from("100000000000"),
      ],
    });

    const crvToken = new ethers.Contract(
      CrvToken.address,
      CrvToken.abi,
      provider
    );

    await crvToken
      .connect(admin)
      .mint(secondAccount.address, ethers.BigNumber.from("1000000"));

    const curveFactory = new ethers.Contract(
      CurveFactory,
      CurveFactoryABI,
      provider
    );

    // Create new StableSwap meta pool (uDA <-> 3Crv)
    await curveFactory
      .connect(secondAccount)
      .deploy_metapool(
        _3CrvBasePool,
        "Ubiquity Algorithmic Dollar",
        "uAD",
        uAD.address,
        10,
        4000000
      );

    const Bonding = await deploy("Bonding", {
      from: admin.address,
      args: [manager.address, sablier],
    });
    bonding = new ethers.Contract(Bonding.address, Bonding.abi, provider);

    await bondingShare
      .connect(admin)
      .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);
  });

  it("Should return the current Sablier address", async () => {
    expect(await bonding.sablier()).to.equal(sablier);
  });

  it("admin should be able to update the Sablier address", async () => {
    await bonding.connect(admin).setSablier(ethers.constants.AddressZero);
    expect(await bonding.sablier()).to.equal(ethers.constants.AddressZero);
  });

  it("Should emit the SablierUpdated event", async () => {
    await expect(bonding.connect(admin).setSablier(DAI))
      .to.emit(bonding, "SablierUpdated")
      .withArgs(DAI);
  });

  it("Should revert when another account tries to update the Sablier address", async () => {
    await expect(
      bonding.connect(secondAccount).setSablier(ethers.constants.AddressZero)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Admin should be able to add protocol token (CollectableDust)", async () => {
    await bonding.connect(admin).addProtocolToken(USDC);
  });

  it("Should revert when another account tries to add protocol token (CollectableDust)", async () => {
    await expect(
      bonding.connect(secondAccount).addProtocolToken(USDC)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Should revert when trying to add an already existing protocol token (CollectableDust)", async () => {
    await expect(
      bonding.connect(admin).addProtocolToken(USDC)
    ).to.be.revertedWith("collectable-dust::token-is-part-of-the-protocol");
  });

  it("Should revert when another account tries to remove a protocol token (CollectableDust)", async () => {
    await expect(
      bonding.connect(secondAccount).removeProtocolToken(USDC)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Admin should be able to remove protocol token (CollectableDust)", async () => {
    await bonding.connect(admin).removeProtocolToken(USDC);
  });

  it("Should revert when trying to remove token that is not a part of the protocol (CollectableDust)", async () => {
    await expect(
      bonding.connect(admin).removeProtocolToken(USDC)
    ).to.be.revertedWith("collectable-dust::token-not-part-of-the-protocol");
  });

  it("Admin should be able to send dust from the contract (CollectableDust)", async () => {
    // Send ETH to the Bonding contract
    await secondAccount.sendTransaction({
      to: bonding.address,
      value: ethers.utils.parseUnits("100", "gwei"),
    });

    // Send dust back to the admin
    await bonding
      .connect(admin)
      .sendDust(
        admin.address,
        await bonding.ETH_ADDRESS(),
        ethers.utils.parseUnits("50", "gwei")
      );
  });

  it("Should emit DustSent event (CollectableDust)", async () => {
    await expect(
      bonding
        .connect(admin)
        .sendDust(
          admin.address,
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        )
    )
      .to.emit(bonding, "DustSent")
      .withArgs(
        admin.address,
        await bonding.ETH_ADDRESS(),
        ethers.utils.parseUnits("50", "gwei")
      );
  });
  it("Should revert when another account tries to remove dust from the contract (CollectableDust)", async () => {
    await expect(
      bonding
        .connect(secondAccount)
        .sendDust(
          admin.address,
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("100", "gwei")
        )
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Should emit ProtocolTokenAdded event (CollectableDust)", async () => {
    await expect(bonding.connect(admin).addProtocolToken(DAI))
      .to.emit(bonding, "ProtocolTokenAdded")
      .withArgs(DAI);
  });

  it("Should emit ProtocolTokenRemoved event (CollectableDust)", async () => {
    await expect(bonding.connect(admin).removeProtocolToken(DAI))
      .to.emit(bonding, "ProtocolTokenRemoved")
      .withArgs(DAI);
  });

  it("Admin should be able to update the maxBondingPrice", async () => {
    await bonding
      .connect(admin)
      .setMaxBondingPrice(ethers.constants.MaxUint256);
    expect(await bonding.maxBondingPrice()).to.equal(
      ethers.constants.MaxUint256
    );
  });

  it("Should revert when unauthorized accounts try to update the maxBondingPrice", async () => {
    await expect(
      bonding
        .connect(secondAccount)
        .setMaxBondingPrice(ethers.constants.MaxUint256)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Should emit the MaxBondingPriceUpdated event", async () => {
    await expect(
      bonding.connect(admin).setMaxBondingPrice(ethers.constants.MaxUint256)
    )
      .to.emit(bonding, "MaxBondingPriceUpdated")
      .withArgs(ethers.constants.MaxUint256);
  });

  it("Admin should be able to update the bondingDiscountMultiplier", async () => {
    await bonding
      .connect(admin)
      .setBondingDiscountMultiplier(ethers.BigNumber.from(2));
    expect(await bonding.bondingDiscountMultiplier()).to.equal(
      ethers.BigNumber.from(2)
    );
  });

  it("Should revert when unauthorized accounts try to update the bondingDiscountMultiplier", async () => {
    await expect(
      bonding
        .connect(secondAccount)
        .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Should emit the BondingDiscountMultiplierUpdated event", async () => {
    await expect(
      bonding
        .connect(admin)
        .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
    )
      .to.emit(bonding, "BondingDiscountMultiplierUpdated")
      .withArgs(BigNumber.from(2));
  });

  it("Admin should be able to update the redeemStreamTime", async () => {
    await bonding
      .connect(admin)
      .setRedeemStreamTime(ethers.BigNumber.from(86400));

    expect(await bonding.redeemStreamTime()).to.equal(
      ethers.BigNumber.from(86400)
    );
  });

  it("Should revert when unauthorized accounts try to update the redeemStreamTime", async () => {
    await expect(
      bonding
        .connect(secondAccount)
        .setRedeemStreamTime(ethers.BigNumber.from(0))
    ).to.be.revertedWith("Caller is not a bonding manager");
  });

  it("Should emit the RedeemStreamTimeUpdated event", async () => {
    await expect(
      bonding.connect(admin).setRedeemStreamTime(ethers.BigNumber.from(0))
    )
      .to.emit(bonding, "RedeemStreamTimeUpdated")
      .withArgs(ethers.BigNumber.from(0));
  });
});
