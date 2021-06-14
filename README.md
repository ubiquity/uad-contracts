# Ubiquity Algorithmic Dollar Contracts

![Logo of the project](https://ubq.fi/image/logos/april-2021/jpg/ubq-logo-waves.jpg)

## Table of Contents

1. [Getting started](#Getting)
2. [Building](#Building)
3. [Deployment](#Deployment)
4. [Testing](#Testing)
5. [Contracts](#Contracts)
6. [Licensing](#Licensing)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/en/download/)

### Installing

Install dependencies:

```sh
yarn install
```

## Building

If it is the first compilation, and only the first time, we need to generate the types first:

```sh
yarn run first
```

Compile the smart contracts:

```sh
yarn run compile
```

To verify the accounts that will be used by hardhat

```sh
npx hardhat accounts
```

## Deployment

To deploy the smart contracts on a network defined in the `hardhat.config.ts`
rename the `example.env` file to `.env` and fill the `MNEMONIC`, `ALCHEMY_API_KEY` and
`COINMARKETCAP_API_KEY` environment variables.

```sh
npx hardhat run --network <your-network> scripts/deployment.ts
```

Note that by default smart contracts will be deployed locally using hardhat development node.

## Mainnet monitoring

### Token

this task will retrieve information about all our tokens including LP token

```sh
npx hardhat --network mainnet token
```

### Incentives

this task will retrieve information about the current incentives and penalty on uAD buy and sell

```sh
npx hardhat --network mainnet incentive
```

### Metapool

this task will retrieve information about our curve uAD-3CRV metapool

```sh
npx hardhat --network mainnet metapool
```

### Price

this task will retrieve information about uAD price

```sh
npx hardhat --network mainnet price
```

## Testing

### Requirements:

- node 14.15 (use nvm)

rename the `example.env` file to `.env` and fill the `ALCHEMY_API_KEY` and
`COINMARKETCAP_API_KEY` environment variables.

### Launch all tests

```sh
yarn run test
```

if you experience some timeout issues try running tests one by one

## Contracts

- twapOracle

  - `0x7944d5b8f9668AfB1e648a61e54DEa8DE734c1d1`

- debtCoupon
  - `0xAd7cceAB6d1633B1760A38650Ad12632B2C7a831`
- uADToken
  - `0x0F644658510c95CB46955e55D7BA9DDa9E9fBEc6`
- couponCalculator
  - `0x4F3dF4c1e22209d623ab55923109112f1E2B17DE`
- dollarMintingCalculator
  - `0xab840faA6A5eF68D8D32370EBC297f4DdC9F870F`
- bondingShare
  - `0x0013B6033dd999676Dc547CEeCEA29f781D8Db17`
- bondingContract
  - `0x831e3674Abc73d7A3e9d8a9400AF2301c32cEF0C`
- uAD-3CRV metapool deployed aka stableSwapMetaPool
  - `0x20955CB69Ae1515962177D164dfC9522feef567E`
- curve3PoolToken
  - `0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490`
- uGOVToken
  - `0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0`
- sushiSwapPool
  - `0x534ac94F198F1fef0aDC45227A2185C7cE8d75dC`
- masterChef
  - `0x8fFCf9899738e4633A721904609ffCa0a2C44f3D`
- formulas
  - `0x54F528979A50FA8Fe99E0118EbbEE5fC8Ea802F7`
- autoRedeemToken
  - `0x5894cFEbFdEdBe61d01F20140f41c5c49AedAe97`
- uarCalculator
  - `0x75d6F33BcF784504dA74e4aD60c677CD1fD3e2d5`
- ExcessDollarsDistributor
  - `0x25d2b980E406bE97237A06Bca636AeD607661Dfa`
- debtCouponMgr
  - `0x432120Ad63779897A424f7905BA000dF38A74554`
- UbiquityAlgorithmicDollarManager
  - `0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98`
- curveIncentive
  - ` 0x86965cdB680350C5de2Fd8D28055DecDDD52745E`
- treasury
  - ` 0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd | ubq.eth(edited)`

## Licensing

Copyright (c) 2021 Ubiquity
Licensed under the MIT License
