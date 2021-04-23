import "@nomiclabs/hardhat-waffle";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { HardhatUserConfig } from "hardhat/config";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "./tasks/index";

dotenv.config();
const mnemonic = `${
  process.env.MNEMONIC ||
  "test test test test test test test test test test test junk"
}`;

const accounts = {
  // use default accounts
  mnemonic,
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.3",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
          metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.7.6/metadata.html
            bytecodeHash: "none",
          },
        },
      },
    ],
  },

  mocha: {
    timeout: 1000000,
  },
  namedAccounts: {
    sablier: "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    curve3CrvBasePool: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    curve3CrvToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    curveFactory: "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE",
    // curveFactory: "0xfD6f33A0509ec67dEFc500755322aBd9Df1bD5B8",
    usdDepositerAddress: "0xA79828DF1850E8a3A3064576f380D90aECDD3359",
    // curveWhaleAddress: "0x09cabda22B553bA8FFCD2d453078e2fD4017404F",
    curveWhaleAddress: "0x1C0b104A9EeFf2F7001348a49fA28b8A0D23d637",
  },

  /*   paths: {
    deploy: "./scripts/deployment",
    deployments: "./deployments",
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  }, */
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${
          process.env.ALCHEMY_API_KEY || ""
        }`,
        blockNumber: 12150000,
      },
      /*  accounts: [
        {
          privateKey: process.env.TREASURY_PRIV_KEY ?? "",
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.SECOND_ACC_PRIV_KEY ?? "",
          balance: "10000000000000000000000",
        },
      ], */
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${
        process.env.ALCHEMY_API_KEY || ""
      }`,
      accounts,
    },
  },
  typechain: {
    outDir: "artifacts/types",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 150,
    onlyCalledMethods: true,
    coinmarketcap: `${process.env.COINMARKETCAP_API_KEY || ""}`,
  },
};

export default config;
