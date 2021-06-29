import fs from "fs";
import path from "path";
import { task } from "hardhat/config";
import fetch from "node-fetch";
import * as ethers from "ethers";
import * as ABI from "../deployments/mainnet/Bonding.json"; // Contract ABI

const inter = new ethers.utils.Interface(ABI.abi);

const API_URL = "https://api.etherscan.io/api";
const query: Record<string, string> = {
  module: "account",
  action: "txlist",
  address: "0x831e3674Abc73d7A3e9d8a9400AF2301c32cEF0C", // This is the bonding smart contract right?
  startblock: "12648260", // Why this block?
  endblock: "12674210", // And why this block?
  sort: "asc",
  apiKey: process.env.ETHERSCAN_API_KEY || "",
};
const adequateSigner = "0xe2bbb158";

type EtherscanResponse = {
  status: string;
  message: string;
  result: Transaction[];
};

type Transaction = {
  isError: "0" | "1";
  input: string;
  hash: string;
};

task(
  "getBondingContracts",
  "Extract bonding contracts from Etherscan API and save them to a file"
)
  .addPositionalParam("path", "The path to store the bonding contracts")
  .setAction(async (taskArgs: { path: string }) => {
    if (!process.env.ETHERSCAN_API_KEY)
      throw new Error("ETHERSCAN_API_KEY environment variable must be set");

    const parsedPath = path.parse(taskArgs.path);
    if (!fs.existsSync(parsedPath.dir))
      throw new Error(`Path ${parsedPath.dir} does not exist`);

    try {
      const response = await fetch(
        `${API_URL}?${new URLSearchParams(query).toString()}`,
        {
          method: "GET",
        }
      );
      const data: EtherscanResponse = await response.json();
      console.log("Results: ", data.result.length);
      const filteredResults = (data.result as Transaction[]).filter(
        (transaction) => {
          const input = inter.parseTransaction({ data: transaction.input });
          console.log(
            "Hash:",
            transaction.hash,
            "Amount: ",
            ethers.BigNumber.from(input.args._lpsAmount).toString(),
            "Weeks: ",
            ethers.BigNumber.from(input.args._weeks).toString()
          );
          return (
            transaction.isError === "0" && input.sighash === adequateSigner
          );
        }
      );

      fs.writeFileSync(taskArgs.path, JSON.stringify(filteredResults, null, 2));
      console.log("Results saved to: ", path.resolve(taskArgs.path));
    } catch (e) {
      console.error("There was an issue with the Etherscan request", e);
    }
  });
