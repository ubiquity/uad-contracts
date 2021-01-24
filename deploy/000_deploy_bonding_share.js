const { ethers } = require("hardhat");

module.exports = async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();

  console.log(admin.address);
  const BondingShare = await deploy("BondingShare", {
    from: admin.address,
    log: true,
    deterministicDeployment: true,
  });

  const bondingShare = new ethers.Contract(
    BondingShare.address,
    BondingShare.abi,
    ethers.provider
  );

  console.log(
    await bondingShare
      .connect(admin)
      .getRoleMember(ethers.utils.id("MINTER_ROLE"), "0")
  );
};
