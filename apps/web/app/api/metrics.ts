import { Metric } from './telemetry';

const deploymentSuccess: Metric = {
  name: 'deploy_space_success',
  counter: {
    value: 1,
  },
};

const deploymentFailure: Metric = {
  name: 'deploy_space_failure',
  counter: {
    value: 1,
  },
};

const deploymentRetry: Metric = {
  name: 'deploy_space_retry',
  counter: {
    value: 1,
  },
};

type TimingName =
  | 'deploy_space_duration'
  | 'deploy_dao_duration'
  | 'wait_for_space_to_be_indexed_duration'
  | 'ipfs_upload_binary_duration'
  | 'ipfs_upload_file_duration';

const timing = (name: TimingName, ms: number): Metric => {
  return {
    name,
    gauge: {
      value: ms,
    },
  };
};

export const Metrics = {
  deploymentSuccess,
  deploymentFailure,
  deploymentRetry,
  timing,
};
