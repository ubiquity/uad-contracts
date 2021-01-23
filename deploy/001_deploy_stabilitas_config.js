const { ethers } = require("hardhat");

module.exports = async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();

  await deploy("StabilitasConfig", {
    from: admin.address,
    args: [admin.address],
    log: true,
    deterministicDeployment: true,
  });

  const stabilitasConfig = await ethers.getContract("StabilitasConfig");
  const bondingShare = await ethers.getContract("BondingShare");
  await stabilitasConfig
    .connect(admin)
    .setBondingShareAddress(bondingShare.address);
};
