import {DAO, IPlugin, PluginSetupProcessor} from '../../typechain';
import {
  InstallationAppliedEvent,
  InstallationPreparedEvent,
  PluginSetupRefStruct,
  UninstallationAppliedEvent,
  UninstallationPreparedEvent,
  UpdateAppliedEvent,
  UpdatePreparedEvent,
} from '../../typechain/@aragon/osx/framework/plugin/setup/PluginSetupProcessor';
import {findEvent, hashHelpers} from '../../utils/helpers';
import {expect} from 'chai';
import {ContractTransaction} from 'ethers';

export async function installPlugin(
  psp: PluginSetupProcessor,
  dao: DAO,
  pluginSetupRef: PluginSetupRefStruct,
  data: string
): Promise<{
  prepareTx: ContractTransaction;
  applyTx: ContractTransaction;
  preparedEvent: InstallationPreparedEvent;
  appliedEvent: InstallationAppliedEvent;
}> {
  const prepareTx = await psp.prepareInstallation(dao.address, {
    pluginSetupRef: pluginSetupRef,
    data: data,
  });

  const preparedEvent = await findEvent<InstallationPreparedEvent>(
    prepareTx,
    'InstallationPrepared'
  );
  if (!preparedEvent) {
    throw new Error('Failed to get InstallationPrepared event');
  }

  const plugin = preparedEvent.args.plugin;

  const applyTx = await psp.applyInstallation(dao.address, {
    pluginSetupRef: pluginSetupRef,
    plugin: plugin,
    permissions: preparedEvent.args.preparedSetupData.permissions,
    helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
  });

  const appliedEvent = await findEvent<InstallationAppliedEvent>(
    applyTx,
    'InstallationApplied'
  );
  if (!appliedEvent) {
    throw new Error('Failed to get InstallationApplied event');
  }

  return {prepareTx, applyTx, preparedEvent, appliedEvent};
}

export async function uninstallPlugin(
  psp: PluginSetupProcessor,
  dao: DAO,
  plugin: IPlugin,
  pluginSetupRef: PluginSetupRefStruct,
  data: string,
  currentHelpers: string[]
): Promise<{
  prepareTx: ContractTransaction;
  applyTx: ContractTransaction;
  preparedEvent: UninstallationPreparedEvent;
  appliedEvent: UninstallationAppliedEvent;
}> {
  const prepareTx = await psp.prepareUninstallation(dao.address, {
    pluginSetupRef: pluginSetupRef,
    setupPayload: {
      plugin: plugin.address,
      currentHelpers: currentHelpers,
      data: data,
    },
  });

  const preparedEvent = await findEvent<UninstallationPreparedEvent>(
    prepareTx,
    'UninstallationPrepared'
  );
  if (!preparedEvent) {
    throw new Error('Failed to get UninstallationPrepared event');
  }

  const preparedPermissions = preparedEvent.args.permissions;

  const applyTx = await psp.applyUninstallation(dao.address, {
    plugin: plugin.address,
    pluginSetupRef: pluginSetupRef,
    permissions: preparedPermissions,
  });

  const appliedEvent = await findEvent<UninstallationAppliedEvent>(
    applyTx,
    'UninstallationApplied'
  );
  if (!appliedEvent) {
    throw new Error('Failed to get UninstallationApplied event');
  }

  return {prepareTx, applyTx, preparedEvent, appliedEvent};
}

export async function updatePlugin(
  psp: PluginSetupProcessor,
  dao: DAO,
  plugin: IPlugin,
  currentHelpers: string[],
  pluginSetupRefCurrent: PluginSetupRefStruct,
  pluginSetupRefUpdate: PluginSetupRefStruct,
  data: string
): Promise<{
  prepareTx: ContractTransaction;
  applyTx: ContractTransaction;
  preparedEvent: UpdatePreparedEvent;
  appliedEvent: UpdateAppliedEvent;
}> {
  expect(pluginSetupRefCurrent.pluginSetupRepo).to.equal(
    pluginSetupRefUpdate.pluginSetupRepo
  );

  const prepareTx = await psp.prepareUpdate(dao.address, {
    currentVersionTag: pluginSetupRefCurrent.versionTag,
    newVersionTag: pluginSetupRefUpdate.versionTag,
    pluginSetupRepo: pluginSetupRefUpdate.pluginSetupRepo,
    setupPayload: {
      plugin: plugin.address,
      currentHelpers: currentHelpers,
      data: data,
    },
  });
  const preparedEvent = await findEvent<UpdatePreparedEvent>(
    prepareTx,
    'UpdatePrepared'
  );
  if (!preparedEvent) {
    throw new Error('Failed to get UpdatePrepared event');
  }

  const applyTx = await psp.applyUpdate(dao.address, {
    plugin: plugin.address,
    pluginSetupRef: pluginSetupRefUpdate,
    initData: preparedEvent.args.initData,
    permissions: preparedEvent.args.preparedSetupData.permissions,
    helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
  });
  const appliedEvent = await findEvent<UpdateAppliedEvent>(
    applyTx,
    'UpdateApplied'
  );
  if (!appliedEvent) {
    throw new Error('Failed to get UpdateApplied event');
  }

  return {prepareTx, applyTx, preparedEvent, appliedEvent};
}
