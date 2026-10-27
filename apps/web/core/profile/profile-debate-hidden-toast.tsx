'use client';

import { useRouter } from 'next/navigation';

import { useToast } from '~/core/hooks/use-toast';
import { hiddenProfileDebatesPath } from '~/core/profile/profile-debate-visibility';

import { SmallButton } from '~/design-system/button';

export function ProfileDebateHiddenToast({ personalSpaceId }: { personalSpaceId: string }) {
  const router = useRouter();
  const [, setToast] = useToast();

  return (
    <div className="flex max-w-[min(36rem,calc(100vw-3rem))] flex-wrap items-center gap-3">
      <p className="min-w-56 flex-1 text-button">Hidden from your profile. Manage hidden debates in the Debates tab.</p>
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
