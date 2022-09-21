export interface IAddressLoader {
  getContractAddress(chain: string | number, contractName: 'Log'): Promise<string>;
}

export const AddressLoader: IAddressLoader = {
  async getContractAddress(chain, contractName) {
    // TODO we should only dynamically look up address in dev.
    // Check process.env.NODE_ENV and load from file for prod.
    const response = await fetch(`http://localhost:3111/contract/address?chain=${chain}&name=${contractName}`);
    return response.text();
  },
};
