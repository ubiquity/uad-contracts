import "@nomiclabs/hardhat-waffle";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{ version: "0.7.6" }, { version: "0.6.6" }],
  },

  mocha: {
    timeout: 1000000,
  },

  namedAccounts: {
    sablier: "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    _3CrvBasePool: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    _3CrvToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    CurveFactory: "0xfD6f33A0509ec67dEFc500755322aBd9Df1bD5B8",
    usdDepositerAddress: "0xA79828DF1850E8a3A3064576f380D90aECDD3359",
    curveWhaleAddress: "0x09cabda22B553bA8FFCD2d453078e2fD4017404F",
  },

  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 11754488,
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

export default config;
