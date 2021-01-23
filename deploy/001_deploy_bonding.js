const { ethers } = require("hardhat");

module.exports = async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();
  const config = await deployments.get("StabilitasConfig");

  await deploy("Bonding", {
    from: admin.address,
    args: [config.address],
    log: true,
    deterministicDeployment: true,
  });
};
