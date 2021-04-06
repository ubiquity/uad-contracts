# Ubiquity Algorithmmic Dollar

![Logo of the project](https://ubq.fi/image/logos/march-2021/vector/cyan.svg)

> Smart contracts .

## Table of Contents

1. [Getting started](#Getting)
2. [Building](#Building)
3. [Deployment](#Deployment)
4. [Testing](#Testing)
5. [Licensing](#Licensing)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/en/download/)

### Installing

Install dependencies:

```sh
yarn install
```

## Building

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

## Licensing

Copyright (c) 2021 Ubiquity
Licensed under the MIT License
