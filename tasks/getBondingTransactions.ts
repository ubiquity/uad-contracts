import fs from "fs";
import path from "path";
import { task, types } from "hardhat/config";
import fetch from "node-fetch";
import * as ethers from "ethers";
import * as ABI from "../deployments/mainnet/Bonding.json"; // Contract ABI

const inter = new ethers.utils.Interface(ABI.abi);

const BONDING_CONTRACT_ADDRESS = "0x831e3674Abc73d7A3e9d8a9400AF2301c32cEF0C";
const API_URL = "https://api.etherscan.io/api";
const CONTRACT_GENESIS_BLOCK = 12595544;
const DEFAULT_OUTPUT_NAME = "bonding_transactions.json";
const contractFunctions = ABI.abi
  .filter((a) => a.type === "function")
  .map((a) => a.name as string);

type EtherscanResponse = {
  status: string;
  message: string;
  result: Transaction[];
};

type Transaction = {
  isError: "0" | "1";
  input: string;
  hash: string;
  from: string;
  to: string;
  blockNumber: string;
  contractAddress: string;
  timeStamp: string;
};

type CliArgs = {
  path: string;
  startBlock: number;
  endBlock?: number;
  name:
    | ""
    | "deposit"
    | "setBlockCountInAWeek"
    | "crvPriceReset"
    | "uADPriceReset";
  isError: boolean;
  listFunctions: boolean;
};

type ParsedTransaction = {
  name: string;
  inputs: Record<string, string>;
  from: string;
  blockNumber: string;
  isError: boolean;
  timestamp: string;
  transaction: Transaction;
};

async function fetchEtherscanApi<T>(query: Record<string, string>): Promise<T> {
  const response = await fetch(
    `${API_URL}?${new URLSearchParams(query).toString()}`
  );
  return response.json() as Promise<T>;
}

async function fetchLatestBlockNumber(): Promise<number> {
  console.log("Fetching latest block number...");
  const response = await fetchEtherscanApi<{ result: string }>({
    module: "proxy",
    action: "eth_blockNumber",
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  });
  const latestBlockNumber = parseInt(response.result, 16);
  console.log("Latest block number: ", latestBlockNumber);
  return latestBlockNumber;
}

function generateEtherscanQuery(
  address: string,
  startblock: number,
  endblock: number
): Record<string, string> {
  return {
    module: "account",
    action: "txlist",
    address, // This is the bonding smart contract right?
    startblock: startblock.toString(),
    endblock: endblock.toString(),
    sort: "asc",
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  };
}

async function fetchEtherscanBondingContract(
  filter: CliArgs
): Promise<EtherscanResponse> {
  const { startBlock } = filter;
  const endBlock = filter.endBlock || (await fetchLatestBlockNumber());
  return fetchEtherscanApi(
    generateEtherscanQuery(BONDING_CONTRACT_ADDRESS, startBlock, endBlock)
  );
}

function parseTransactions(transactions: Transaction[]): ParsedTransaction[] {
  return transactions.map((t) => {
    const parsedTransaction: ParsedTransaction = {
      name: "",
      inputs: {},
      from: t.from,
      blockNumber: t.blockNumber,
      isError: t.isError === "1",
      timestamp: new Date(parseInt(t.timeStamp, 10) * 1000).toISOString(),
      transaction: t,
    };
    if (t.to) {
      const input = inter.parseTransaction({ data: t.input });
      parsedTransaction.name = input.name;

      console.log(input);
      parsedTransaction.inputs = Object.fromEntries(
        Object.keys(input.args)
          .filter((k) => !/^[0-9]+$/.exec(k))
          .map((k) => {
            return [k, (input.args[k] as ethers.BigNumber).toString()];
          })
      );
    } else {
      parsedTransaction.name = "Contract creation";
    }
    return parsedTransaction;
  });
}

function filterTransactions(
  transactions: ParsedTransaction[],
  args: CliArgs
): ParsedTransaction[] {
  return transactions.filter((t) => {
    return (!args.name || t.name === args.name) && args.isError === t.isError;
  });
}

function writeToDisk(transactions: ParsedTransaction[], directory: string) {
  fs.writeFileSync(
    directory,
    JSON.stringify(
      transactions.map((t) => t.transaction),
      null,
      2
    )
  );
}

function printInGroups(items: string[], groups: number) {
  const pad = Math.max(...items.map((f) => f.length)) + 1;
  contractFunctions
    .reduce<string[][]>((r, e, i) => {
      i % groups ? r[r.length - 1].push(e) : r.push([e]);
      return r;
    }, [])
    .forEach((funs) =>
      console.log("   ", ...funs.map((f) => f.padEnd(pad, " ")))
    );
}

task(
  "getBondingTransactions",
  "Extract the bonding contract transactions from Etherscan API and save them to a file"
)
  .addPositionalParam(
    "path",
    "The path to store the bonding contracts",
    `./${DEFAULT_OUTPUT_NAME}`,
    types.string
  )
  .addOptionalParam(
    "startBlock",
    "The starting block for the Etherscan request (defaults is contract creation block)",
    CONTRACT_GENESIS_BLOCK,
    types.int
  )
  .addOptionalParam(
    "endBlock",
    "The end block for the Etherscan request (defaults to latest block)",
    undefined,
    types.int
  )
  .addOptionalParam(
    "name",
    "The function name (use empty string for all) (ex: deposit, crvPriceReset, uADPriceReset, setBlockCountInAWeek)",
    "deposit",
    types.string
  )
  .addOptionalParam(
    "isError",
    "Select transactions that were errors",
    false,
    types.boolean
  )
  .setAction(async (taskArgs: CliArgs) => {
    console.log("Arguments: ", taskArgs);
    if (!process.env.ETHERSCAN_API_KEY)
      throw new Error("ETHERSCAN_API_KEY environment variable must be set");

    const parsedPath = path.parse(taskArgs.path);
    if (!fs.existsSync(parsedPath.dir))
      throw new Error(`Path ${parsedPath.dir} does not exist`);

    console.log("Contract functions:");
    printInGroups(contractFunctions, 4);

    if (taskArgs.name && contractFunctions.indexOf(taskArgs.name) === -1) {
      throw new Error(`Function does not exists of the contract`);
    }

    try {
      const response = await fetchEtherscanBondingContract(taskArgs);
      const transactions = parseTransactions(response.result);
      console.log("Total results: ", transactions.length);
      const filteredTransactions = filterTransactions(transactions, taskArgs);
      console.log("Filtered results: ", filteredTransactions.length);
      console.table(filteredTransactions, [
        "name",
        "inputs",
        "from",
        "blockNumber",
        "isError",
        "timestamp",
      ]);
      writeToDisk(filteredTransactions, taskArgs.path);
      console.log("Results saved to: ", path.resolve(taskArgs.path));
    } catch (e) {
      console.error("There was an issue with the task", e);
    }
  });
