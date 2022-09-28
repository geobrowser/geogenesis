export interface IAddressLoader {
  getContractAddress(chain: string | number, contractName: 'Log'): Promise<string>;
}

export class AddressLoader implements IAddressLoader {
  constructor(public devServer: string) {}

  async getContractAddress(chain: string | number, contractName: 'Log') {
    // TODO we should only dynamically look up address in dev.
    // Check process.env.NODE_ENV and load from file for prod.
    const response = await fetch(`${this.devServer}/contract/address?chain=${chain}&name=${contractName}`);
    return response.text();
  }
}
