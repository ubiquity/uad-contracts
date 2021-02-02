const { network } = require("hardhat");

exports.passOneHour = async () => {
  await network.provider.request({
    method: "evm_increaseTime",
    params: [3600],
  });
};

exports.mineBlock = async (timestamp) => {
  await network.provider.request({
    method: "evm_mine",
    params: [timestamp],
  });
};
