import governanceBuildMetadata from './src/governance/governance-build-metadata.json';
import governanceReleaseMetadata from './src/governance/governance-release-metadata.json';
import personalSpaceAdminBuildMetadata from './src/personal/personal-space-admin-build-metadata.json';
import personalSpaceAdminReleaseMetadata from './src/personal/personal-space-admin-release-metadata.json';
import spaceBuildMetadata from './src/space/space-build-metadata.json';
import spaceReleaseMetadata from './src/space/space-release-metadata.json';

export const SpacePluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geobrowser-contracts-space-plugin',
  PLUGIN_CONTRACT_NAME: 'SpacePlugin',
  PLUGIN_SETUP_CONTRACT_NAME: 'SpacePluginSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: spaceBuildMetadata,
    release: spaceReleaseMetadata,
  },
};

export const PersonalSpaceAdminPluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geobrowser-contracts-personal-space-plugin',
  PLUGIN_CONTRACT_NAME: 'PersonalSpaceAdminPlugin',
  PLUGIN_SETUP_CONTRACT_NAME: 'PersonalSpaceAdminPluginSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: personalSpaceAdminBuildMetadata,
    release: personalSpaceAdminReleaseMetadata,
  },
};

export const GovernancePluginsSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geobrowser-contracts-governance-plugin',
  PLUGIN_CONTRACT_NAME: 'MainVotingPlugin and MemberAccessPlugin',
  PLUGIN_SETUP_CONTRACT_NAME: 'GovernancePluginsSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: governanceBuildMetadata,
    release: governanceReleaseMetadata,
  },
};

// Types

export type PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: string;
  PLUGIN_CONTRACT_NAME: string;
  PLUGIN_SETUP_CONTRACT_NAME: string;
  VERSION: {
    release: number;
    build: number;
  };
  METADATA: {
    build: {[k: string]: any};
    release: {[k: string]: any};
  };
};
