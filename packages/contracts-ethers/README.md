# Aragon Contracts for ethers.js

NPM package that provides ethers.js wrappers to use the Geo smart contracts.

```sh
yarn add <package-name>
```

## Usage

### Attaching to a contract

```ts
import {
  MainVotingPluginFactory__factory
} from "<package-name>";

// Use it
const mainVotingPluinInstance = MainVotingPluginFactory__factory.connect(...);
```

## Development

- Run `yarn` at the **root** of the monorepo, not on this folder.
- Then, in the `contracts-ethers` folder run:
  - `yarn run:contracts`
  - `yarn run`
  - `yarn run:npm`
