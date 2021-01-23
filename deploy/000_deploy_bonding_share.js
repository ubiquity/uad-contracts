const { ethers } = require("hardhat");

module.exports = async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();

  await deploy("BondingShare", {
    from: admin.address,
    log: true,
    deterministicDeployment: true,
  });
};
