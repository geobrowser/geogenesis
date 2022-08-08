# Geo Smart Contracts

Solidity smart contracts used by Geo.

## Commands

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
# runs the test suite and generates a gas report for the contract functions
REPORT_GAS=true npx hardhat test
# runs the test suite and generates a coverage report for the contracts.
# to view, open the generated ./contracts/coverage/index.html page in a web browser
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

## Polygonscan verification

To try out Polygonscan verification, you first need to deploy a contract to an Ethereum network that's supported by Polygonscan, such as Mumbai.

In this project, copy the `.env.template` file to a file named `.env`, and then edit it to fill in the details. Enter your Polygonscan API key, your Mumbai node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid `.env` file in place, first deploy your contract:

```shell
hardhat run --network polygon_mumbai scripts/deploy.ts
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network polygon_mumbai DEPLOYED_CONTRACT_ADDRESS "https://geogenesis.vercel.app/api/page/"
```

## Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
