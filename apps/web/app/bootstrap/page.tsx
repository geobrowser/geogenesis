'use client';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';

export default function Page() {
  const deploy = useDeploySpace();

  const onClick = () => {
    deploy.deploy({
      type: 'default',
      governanceType: 'PUBLIC',
      spaceName: 'Geo',
    });
  };

  return <button onClick={onClick}>Bootstrap</button>;
}
