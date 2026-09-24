'use client';

import { useRouter } from 'next/navigation';

import { useToast } from '~/core/hooks/use-toast';
import { hiddenProfileDebatesPath } from '~/core/profile/profile-debate-visibility';

import { SmallButton } from '~/design-system/button';

export function ProfileDebateHiddenToast({ personalSpaceId }: { personalSpaceId: string }) {
  const router = useRouter();
  const [, setToast] = useToast();

  return (
    <div className="flex items-center gap-3">
      <p className="text-button">Hidden from your profile. Manage hidden debates in the Debates tab.</p>
      <SmallButton
        variant="tertiary"
        onClick={() => {
          setToast(null);
          router.push(hiddenProfileDebatesPath(personalSpaceId));
        }}
      >
        View hidden debates
      </SmallButton>
    </div>
  );
}
