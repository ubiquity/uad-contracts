const { expect, use } = require("chai");
const { describe, it, beforeEach } = require("mocha");
const { ethers, deployments, waffle, getNamedAccounts } = require("hardhat");

const provider = waffle.provider;
const { deploy } = deployments;
const { solidity } = waffle;
use(solidity);

describe("Bonding", () => {
  let bonding;
  let config;
  let admin;
  let secondAccount;
  let sablier;
  let USDC;
  let DAI;

  beforeEach(async () => {
    ({ sablier, USDC, DAI } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();

    const Config = await deploy("StabilitasConfig", {
      from: admin.address,
      args: [admin.address, sablier],
    });
    config = new ethers.Contract(Config.address, Config.abi, provider);

    await deploy("Bonding", { from: admin.address, args: [config.address] });
    const Bonding = await deployments.get("Bonding");
    bonding = new ethers.Contract(Bonding.address, Bonding.abi, provider);
  });

  it("Owner should be able to add protocol token (CollectableDust)", async () => {
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

  it("Owner should be able to remove protocol token (CollectableDust)", async () => {
    await bonding.connect(admin).removeProtocolToken(USDC);
  });

  it("Should revert when trying to remove token that is not a part of the protocol (CollectableDust)", async () => {
    await expect(
      bonding.connect(admin).removeProtocolToken(USDC)
    ).to.be.revertedWith("collectable-dust::token-not-part-of-the-protocol");
  });

  it("Owner should be able to send dust from the contract (CollectableDust)", async () => {
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
});
