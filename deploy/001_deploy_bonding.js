const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { sablier } = await getNamedAccounts();
  const [admin] = await ethers.getSigners();
  const config = await deployments.get("StabilitasConfig");

  await deploy("Bonding", {
    from: admin.address,
    args: [config.address, sablier],
    log: true,
    deterministicDeployment: true,
  });
};
