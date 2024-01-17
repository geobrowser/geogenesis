'use client';

import { useRouter } from 'next/navigation';

import { useToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { NewTab } from '~/design-system/icons/new-tab';

interface Props {
  name: string;
  entityId: string;
  spaceId: string;
  linked?: boolean;
}

export function TeamMemberCreatedToast({ name, entityId, spaceId, linked }: Props) {
  const router = useRouter();
  const [, setToast] = useToast();

  return (
    <div className="flex items-center gap-3">
      <p className="text-button">
        {name} {linked ? 'linked' : 'created'}!
      </p>
      <SmallButton
        onClick={() => router.push(NavUtils.toEntity(spaceId, entityId))}
        icon={<NewTab />}
        variant="tertiary"
      >
        Open
      </SmallButton>
      <button onClick={() => setToast(null)}>
        <Close />
      </button>
    </div>
  );
}
