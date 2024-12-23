'use client';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';

export default function Page() {
  const deploy = useDeploySpace();

  const onClick = () => {
    deploy.deploy({
      type: 'personal',
      governanceType: 'PERSONAL',
      spaceName: 'Root',
    });
  };

  return <div onClick={onClick}>Bootstrap</div>;
}
