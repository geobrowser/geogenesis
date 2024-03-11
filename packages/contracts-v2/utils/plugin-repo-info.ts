import {existsSync, readFileSync, statSync, writeFileSync} from 'fs';

type PluginRepos = {
  [k: string]: PluginRepoInfo[];
};
export type PluginRepoInfo = {
  ensName: string;
  address: string;
  blockNumberOfDeployment: number;
  releases: {[k: string]: PluginRepoRelease};
};
type PluginRepoRelease = {
  builds: {[k: string]: PluginRepoBuild};
  releaseMetadataURI: string;
};
export type PluginRepoBuild = {
  setup: {
    name: string;
    address: string;
    blockNumberOfDeployment: number;
  };
  implementation: {
    name: string;
    address: string;
    blockNumberOfDeployment: number;
  };
  helpers: {
    name: string;
    address: string;
    blockNumberOfDeployment: number;
  }[];
  buildMetadataURI: string;
  blockNumberOfPublication: number;
};

function getFilePathFromNetwork(networkName: string): string {
  if (['localhost', 'hardhat', 'coverage'].includes(networkName)) {
    return 'plugin-repo-info-dev.json';
  }
  return 'plugin-repo-info.json';
}

export function getPluginRepoInfo(
  repoEnsName: string,
  networkName: string
): PluginRepoInfo | null {
  const pluginReposFilePath = getFilePathFromNetwork(networkName);

  if (
    !existsSync(pluginReposFilePath) ||
    statSync(pluginReposFilePath).size === 0
  ) {
    return null;
  }

  const pluginRepos: PluginRepos = JSON.parse(
    readFileSync(pluginReposFilePath, 'utf-8')
  );
  if (!pluginRepos[networkName]?.length) {
    return null;
  }
  return pluginRepos[networkName].find(r => r.ensName === repoEnsName) || null;
}

function storePluginRepoInfo(
  pluginRepoInfo: PluginRepoInfo,
  networkName: string
) {
  const pluginReposFilePath = getFilePathFromNetwork(networkName);

  let pluginRepos: PluginRepos;

  if (
    existsSync(pluginReposFilePath) &&
    statSync(pluginReposFilePath).size > 1
  ) {
    pluginRepos = JSON.parse(readFileSync(pluginReposFilePath, 'utf-8'));
  } else {
    pluginRepos = {};
  }

  if (!pluginRepos[networkName]?.length) {
    pluginRepos[networkName] = [];
  }
  const idx = pluginRepos[networkName].findIndex(
    r => r.ensName === pluginRepoInfo.ensName
  );
  if (idx < 0) {
    pluginRepos[networkName].push(pluginRepoInfo);
  } else {
    pluginRepos[networkName][idx] = pluginRepoInfo;
  }

  writeFileSync(
    pluginReposFilePath,
    JSON.stringify(pluginRepos, null, 2) + '\n'
  );
}

export function addDeployedRepo(
  repoEnsName: string,
  networkName: string,
  contractAddr: string,
  blockNumber: number
) {
  const pluginRepoInfo = getPluginRepoInfo(repoEnsName, networkName);
  if (pluginRepoInfo !== null) {
    console.warn(
      `Warning: Adding a deployed plugin repo over the existing ${repoEnsName}`
    );
  }

  const newPluginRepoInfo: PluginRepoInfo = {
    ensName: repoEnsName,
    address: contractAddr,
    blockNumberOfDeployment: blockNumber,
    releases: {},
  };
  storePluginRepoInfo(newPluginRepoInfo, networkName);
}

export function addDeployedVersion(
  repoEnsName: string,
  networkName: string,
  releaseMetadataURI: string,
  version: {release: number; build: number},
  pluginRepoBuild: PluginRepoBuild
) {
  const pluginRepoInfo = getPluginRepoInfo(repoEnsName, networkName);
  if (!pluginRepoInfo) {
    throw new Error("The plugin repo info entry doesn't exist");
  }

  // Ensure non-empty releases and builds
  if (!pluginRepoInfo.releases) {
    pluginRepoInfo.releases = {};
  }
  if (!pluginRepoInfo.releases[version.release]) {
    pluginRepoInfo.releases[version.release] = {
      builds: {},
      releaseMetadataURI: releaseMetadataURI,
    };
  } else {
    pluginRepoInfo.releases[version.release].releaseMetadataURI =
      releaseMetadataURI;
  }

  if (pluginRepoInfo.releases[version.release].builds[version.build]) {
    console.warn(
      `Warning: Writing a build on top of the existing build ${version.build} or ${repoEnsName}`
    );
  }
  pluginRepoInfo.releases[version.release].builds[version.build] =
    pluginRepoBuild;

  storePluginRepoInfo(pluginRepoInfo, networkName);
}
