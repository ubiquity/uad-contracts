import "@nomiclabs/hardhat-waffle";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { HardhatUserConfig } from "hardhat/config";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "./tasks/index";
import "@nomiclabs/hardhat-etherscan";

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
    tester: "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d",
    sablier: "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    curve3CrvBasePool: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    curve3CrvToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    curveFactory: "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE",
    curveWhaleAddress: "0xC2872ab688400940d5a6041599b3F7de20730d49",
    daiWhaleAddress: "0x16463c0fdB6BA9618909F5b120ea1581618C1b9E",
    sushiMultiSig: "0x9a8541Ddf3a932a9A922B607e9CF7301f1d47bD1",
    ubq: "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd",
    UbqWhaleAddress: "0xa53A6fE2d8Ad977aD926C485343Ba39f32D3A3F6",
    MasterChefAddress: "0x8fFCf9899738e4633A721904609ffCa0a2C44f3D",
    MetaPoolAddress: "0x20955cb69ae1515962177d164dfc9522feef567e",
    BondingAddress: "0x831e3674Abc73d7A3e9d8a9400AF2301c32cEF0C",
    BondingV2Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // FAKE ADDRESS, TO BE REPLACED AFTER V2 DEPLOYMENT
    UbiquityAlgorithmicDollarManagerAddress:
      "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98",
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
    localhost: {
      url: `http://127.0.0.1:8545`,
      accounts,
    },
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${
          process.env.ALCHEMY_API_KEY || ""
        }`,
        blockNumber: 12592661,
        // block before setUGOVPerBlock set to 0
        // blockNumber: 12942182,
      },
      accounts,
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
      // accounts: [process.env.UBQ ?? ""],
      accounts,
      gasPrice: 2500000,
    },
    ropsten: {
      gasPrice: 100000000000,
      url: `https://eth-ropsten.alchemyapi.io/v2/${
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
    gasPrice: 35,
    onlyCalledMethods: true,
    coinmarketcap: `${process.env.COINMARKETCAP_API_KEY || ""}`,
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: `${process.env.ETHERSCAN_API_KEY || ""}`,
  },
};

export default config;
