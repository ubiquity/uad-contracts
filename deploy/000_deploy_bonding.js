const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { sablier } = await getNamedAccounts();
  const [treasury] = await ethers.getSigners();

  await deploy("Bonding", {
    from: treasury.address,
    args: [sablier],
    log: true,
    deterministicDeployment: true,
  });
};
