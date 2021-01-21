const { expect, use } = require("chai");
const { describe, it, beforeEach } = require("mocha");
const { ethers, deployments, waffle, getNamedAccounts } = require("hardhat");

const provider = waffle.provider;
const { deploy } = deployments;
const { solidity } = waffle;
use(solidity);

describe("Bonding", () => {
  let Bonding;
  let bonding;
  let treasury;
  let secondAccount;
  let sablier;

  beforeEach(async () => {
    ({ sablier } = await getNamedAccounts());
    [treasury, secondAccount] = await ethers.getSigners();

    await deploy("Bonding", { from: treasury.address, args: [sablier] });
    Bonding = await deployments.get("Bonding");
    bonding = new ethers.Contract(Bonding.address, Bonding.abi, provider);
  });

  it("Owner should be the treasury", async () => {
    expect(await bonding.owner()).to.equal(treasury.address);
  });

  it("Should return the current Sablier address", async () => {
    expect(await bonding.sablier()).to.equal(sablier);
  });

  it("Treasury should be able to update the Sablier address", async () => {
    await bonding.connect(treasury).setSablier(ethers.constants.AddressZero);
    expect(await bonding.sablier()).to.equal(ethers.constants.AddressZero);
  });

  it("Should revert when another account tries to update the Sablier address", async () => {
    await expect(
      bonding.connect(secondAccount).setSablier(ethers.constants.AddressZero)
    ).to.be.revertedWith("caller is not the owner");
  });
});
