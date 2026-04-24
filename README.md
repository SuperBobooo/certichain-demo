# CertiChain

CertiChain is a classroom demo for certificate issuance, verification, and revocation using [Solidity](https://soliditylang.org/), Hardhat, [Next.js](https://nextjs.org/), and MetaMask.

The demo keeps original certificate metadata off-chain. The browser computes a local metadata hash, stores that hash in the smart contract, and later recomputes the same hash during verification. Revoked certificates remain visible on chain but no longer verify as valid.

![CertiChain demo](./screenshot.png)

- [Get started](#getting-started)

## Packages

### Contracts

`packages/contracts` - All smart contract files.

#### Contracts Stack

- [Alchemy](https://www.alchemy.com/)
- [Hardhat](https://hardhat.org/)
- [Mocha](https://mochajs.org/)
- [Chai](https://www.chaijs.com/)
- [Solidity](https://soliditylang.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Prettier](https://prettier.io/)

#### Contracts Scripts

- `yarn start` - Starts your local Hardhat network
- `yarn test` - Tests `CertiChain.sol` issuance, verification, and revocation
- `yarn deploy` - Deploys `CertiChain.sol` to your local Hardhat network
- `yarn deploy:sepolia` - Deploys `CertiChain.sol` to the Sepolia test network
- `yarn format` - Formats all code using Prettier

### App

`packages/app` - All client application files.

#### App Stack

- [Alchemy](https://www.alchemy.com/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [viem](https://viem.sh/)
- [wagmi](https://wagmi.sh/)
- [RainbowKit](https://www.rainbowkit.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Prettier](https://prettier.io/)

#### App Scripts

- `yarn dev` - Starts the Next.js local development environment
- `yarn build` - Creates an optimised production build of your app
- `yarn start` - Starts the Next.js application in production mode
- `yarn lint` - Checks for problems in your code using ESLint
- `yarn format` - Formats all code using Prettier

## Prerequisites

- [Node](https://nodejs.org/en/download/)
- [MetaMask](https://metamask.io/download.html)

## Getting Started

How to get running on your local machine:

### Initial Setup

Enter the repository folder, then install all dependencies using `yarn`.

This repository uses Yarn workspaces, so this will install the relevant dependencies for each package in one command.

### Contracts Setup

Enter the `contracts` folder with `cd packages/contracts` and start your local hardhat node with `yarn start`. If you're successful, you'll be presented with a number of accounts (one of which you'll need later). Here's an example:

```bash
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

In a new terminal window, deploy the `CertiChain` contract using `yarn deploy`. If you're successful, you'll get a contract address (that you'll also need later) like this:

```bash
CertiChain deployed to 0x5FbDB2315678afecb367f032d93F642f64180aa3
Set NEXT_PUBLIC_CONTRACT_ADDRESS to this address before running the Next.js demo.
```

### App Setup

Enter the `app` folder with `cd packages/app` from the root directory.

For the local Hardhat + MetaMask demo, you do not need a RainbowKit project ID or WalletConnect relay configuration.

Afterwards, duplicate `.env.example` and rename the file `.env`.

`NEXT_PUBLIC_CHAIN_ID` should already be set to the Hardhat local network ID of `31337` (change this when you want your app to run on other chains).

Finally, set `NEXT_PUBLIC_CONTRACT_ADDRESS` using the contract address you received when you deployed. For example: `NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3`

Once your environment variables are set, run the application using `yarn dev`. To view, open up `localhost:3000` (or whatever port Next.js has assigned) in your browser.

### MetaMask Setup

To fully demo the apps' features, you'll need a web3 wallet extension. If you don't have MetaMask installed already, you can get it [here](https://metamask.io/download.html).

If you haven't used Hardhat before, you'll need to add a test account to write to the smart contract that you deployed. Do this by importing one of the accounts you noted down earlier to MetaMask using the accounts' private key (for example, `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`).

Once connected to the app with the test account, you can issue a certificate, verify the original metadata, revoke the certificate from the same issuer wallet, and verify again to see the revoked status.

### Demo Flow

1. Use sample data in **Issue Certificate** and submit the transaction.
2. Use **Use Latest Issued Data** in **Verify Certificate** and verify. The result should be `VALID`.
3. Use **Use Latest Issued Certificate** in **Revoke Certificate** and submit the transaction from the original issuer wallet.
4. Verify the same certificate and metadata again. The result should be `REVOKED`, with hash match still shown as `Yes`.

## Advanced

Instructions for deploying the smart contract and application to publically viewable environments:

### Advanced Contracts

Up to now, your smart contract has been running locally. The next step is to deploy it to a live test network. We'll use [Sepolia](https://www.alchemy.com/overviews/sepolia-testnet) for this.

#### Deploying to Sepolia Testnet

First you need some Sepolia test ETH. You can get some from a [Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia).

In the `packages/contracts` directory, duplicate `.env.example` to `.env`. You'll need an [Alchemy API key](https://docs.alchemy.com/docs/alchemy-quickstart-guide#1key-create-an-alchemy-key) and the private key of the wallet you'd like to deploy your Sepolia contract from. I recommend using a burner account that doesn't hold any valuable assets on other chains.

Set the environment variables like so:

```bash
ALCHEMY_API_KEY=[your-api-key]
SEPOLIA_PRIVATE_KEY=[your-private-key]
```

Finally, run `yarn deploy:sepolia`. If you're successful, you'll get a message ike this in your terminal window:

```bash
CertiChain deployed to 0xE47c47B1db8823BA54aae021cfce03b2d37B52a8
```

#### Verifying Your Contract on Sepolia

Let's verify your newly deployed contract with Etherscan. First, get an Etherscan API key [here](https://docs.etherscan.io/getting-started/viewing-api-usage-statistics). Then add it to your `.env` file:

```bash
ETHERSCAN_API_KEY=[your-api-key]
```

Run `yarn verify:sepolia [your-contract-address]` to verify your contract. CertiChain has no constructor arguments.

If you're successful, you'll get a message like this:

```bash
Successfully verified contract CertiChain on the block explorer.
```

### Advanced App

Let's look at deploying your application.

#### Adding an Alchemy API Key

To interact with smart contracts on a testnet or mainnet from your app, you'll need an Alchemy API key. You can get one [here](https://docs.alchemy.com/docs/alchemy-quickstart-guide#1key-create-an-alchemy-key) if you didn't get one earlier.

Add this to `.env` in `packages/app` like so:

```bash
ALCHEMY_API_KEY=[your-api-key]
```

This will let you point your front end at a publically viewable contract on a network like Sepolia or mainnet.

#### Deploying to Vercel

You can deploy the application to Vercel by clicking this button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Be sure to deploy from the `packages/app` directory and set these environment variables:

```bash
NEXT_PUBLIC_ALCHEMY_API_KEY=[your-api-key]
NEXT_PUBLIC_CONTRACT_ADDRESS=[your-contract-address]
NEXT_PUBLIC_CHAIN_ID=[your-chain-id]
```

## Contributions

All suggestions for improvement are welcome.

## Disclaimer

All code in this repository is unaudited. Use at your own risk.
