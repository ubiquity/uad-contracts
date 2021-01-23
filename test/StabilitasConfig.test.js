const { expect, use } = require("chai");
const { describe, it, beforeEach } = require("mocha");
const { ethers, deployments, waffle, getNamedAccounts } = require("hardhat");

const provider = waffle.provider;
const { deploy } = deployments;
const { solidity } = waffle;
use(solidity);

describe("StabilitasConfig", () => {
  let config;
  let admin;
  let secondAccount;
  let sablier;

  beforeEach(async () => {
    ({ sablier } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();

    const Config = await deploy("StabilitasConfig", {
      from: admin.address,
      args: [admin.address, sablier],
    });
    config = new ethers.Contract(Config.address, Config.abi, provider);
  });

  it("Should return the current Sablier address", async () => {
    expect(await config.sablier()).to.equal(sablier);
  });

  it("admin should be able to update the Sablier address", async () => {
    await config.connect(admin).setSablier(ethers.constants.AddressZero);
    expect(await config.sablier()).to.equal(ethers.constants.AddressZero);
  });

  it("Should revert when another account tries to update the Sablier address", async () => {
    await expect(
      config.connect(secondAccount).setSablier(ethers.constants.AddressZero)
    ).to.be.revertedWith("Caller is not a bonding manager");
  });
});
