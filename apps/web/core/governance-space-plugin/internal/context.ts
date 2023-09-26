import { Context, ContextCore } from '@aragon/sdk-client-common';

import { GeoPluginContextState, GeoPluginOverriddenState } from './types';
import { GeoPluginContextParams } from './types';

// set your defaults here or import them from a package
// we need to deploy and set all of these
const DEFAULT_SIMPLE_STORAGE_PLUGIN_ADDRESS = '0x1234567890123456789012345678901234567890';
const DEFAULT_SIMPLE_STORAGE_Repo_ADDRESS = '0x2345678901234567890123456789012345678901';

export class GeoPluginContext extends ContextCore {
  // super is called before the properties are initialized
  // so we initialize them to the value of the parent class
  protected state: GeoPluginContextState = this.state;

  protected overriden: GeoPluginOverriddenState = this.overriden;
  constructor(contextParams?: Partial<GeoPluginContextParams>, aragonContext?: Context) {
    // call the parent constructor
    // so it does not complain and we
    // can use this
    super();
    // set the context params inherited from the context
    if (aragonContext) {
      // copy the context properties to this
      Object.assign(this, aragonContext);
    }
    // contextParams have priority over the aragonContext
    if (contextParams) {
      // overide the context params with the ones passed to the constructor
      this.set(contextParams);
    }
  }

  public set(contextParams: GeoPluginContextParams) {
    // the super function will call this set
    // so we need to call the parent set first
    super.set(contextParams);
    // set the default values for the new params
    this.setDefaults();
    // override default params if specified in the context
    if (contextParams.geoPluginPluginAddress) {
      // override the myPluginPluginAddress value
      this.state.myPluginPluginAddress = contextParams.geoPluginPluginAddress;
      // set the overriden flag to true in case set is called again
      this.overriden.myPluginPluginAddress = true;
    }

    if (contextParams.myPluginRepoAddress) {
      this.state.myPluginRepoAddress = contextParams.myPluginRepoAddress;
      this.overriden.myPluginRepoAddress = true;
    }
  }

  private setDefaults() {
    if (!this.overriden.myPluginPluginAddress) {
      // set the default value for myPluginPluginAddress
      this.state.myPluginPluginAddress = DEFAULT_SIMPLE_STORAGE_PLUGIN_ADDRESS;
    }
    if (!this.overriden.myPluginPluginAddress) {
      this.state.myPluginPluginAddress = DEFAULT_SIMPLE_STORAGE_Repo_ADDRESS;
    }
  }

  get myPluginPluginAddress(): string {
    return this.state.myPluginPluginAddress;
  }

  get myPluginRepoAddress(): string {
    return this.state.myPluginRepoAddress;
  }
}
