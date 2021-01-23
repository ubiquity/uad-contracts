const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { sablier } = await getNamedAccounts();
  const [admin] = await ethers.getSigners();

  await deploy("StabilitasConfig", {
    from: admin.address,
    args: [admin.address, sablier],
    log: true,
    deterministicDeployment: true,
  });
};
