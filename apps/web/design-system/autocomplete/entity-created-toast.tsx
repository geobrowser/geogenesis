'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';
import { SmallButton } from '~/design-system/button';
import { Icon } from '~/design-system/icon';

interface Props {
  entityId: string;
  spaceId: string;
}

export function EntityCreatedToast({ entityId, spaceId }: Props) {
  const router = useRouter();
  const [, setToast] = useToast();

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => setToast(false)}>
        <Icon icon="close" />
      </button>
      <p className="text-button">New entity created</p>

      <SmallButton onClick={() => router.push(NavUtils.toEntity(spaceId, entityId))} icon="newTab" variant="tertiary">
        Open
      </SmallButton>
    </div>
  );
}
