require("@nomiclabs/hardhat-waffle");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("dotenv").config();
require("@eth-optimism/smock/build/src/plugins/hardhat-storagelayout");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [{ version: "0.7.6" }, { version: "0.6.6" }],
  },

  namedAccounts: {
    sablier: "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    _3CrvBasePool: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    _3CrvToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
  },

  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 11695522,
      },
      accounts: [
        {
          privateKey: process.env.TREASURY_PRIV_KEY,
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.SECOND_ACC_PRIV_KEY,
          balance: "10000000000000000000000",
        },
      ],
    },
  },
};
