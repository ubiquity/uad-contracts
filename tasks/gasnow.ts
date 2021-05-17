import "@nomiclabs/hardhat-waffle";
import { task } from "hardhat/config";
import fetch from "node-fetch";

task("gasnow", "fetching current gas prices").setAction(
  async function fetchFastGasNow(_taskArgs, { ethers }) {
    console.log(`fetching current gas prices...`);
    const promise = await fetch(`https://www.gasnow.org/api/v3/gas/price`);
    const response = promise.json() as Promise<GasNowResponse>;
    const data = (await response).data;
    const int = data?.rapid || data?.fast || data?.standard || data?.slow;
    const gwei = ethers.utils.formatUnits(int, "gwei");
    console.log(`${gwei} gwei`);
    process.env.GWEI = gwei.toString();
  }
);

interface GasNowResponse {
  code: 200;
  data: {
    rapid: 118000000000;
    fast: 107000000000;
    standard: 101200000000;
    slow: 93500000000;
    timestamp: 1621192635513;
  };
}
