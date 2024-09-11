'use client';

import cx from 'classnames';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';

import { useCallback, useState } from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';

import { teamNoticeDismissedAtom } from '~/atoms';
import type { RepeatingNotice } from '~/atoms';

type TeamNoticeProps = {
  spaceId: string;
};

export const TeamNotice = ({ spaceId }: TeamNoticeProps) => {
  const [dismissed, setDismissed] = useAtom(teamNoticeDismissedAtom);
  const showNotice = getShowNotice(dismissed);
  const isEditing = useUserIsEditing(spaceId);

  const handleDismiss = useCallback(() => {
    setDismissed({
      dismissedCount: dismissed.dismissedCount + 1,
      lastDismissed: dayjs().format('YYYY-MM-DD'),
    });
  }, [dismissed, setDismissed]);

  const handleDismissForever = useCallback(() => {
    setDismissed({
      dismissedCount: -1,
      lastDismissed: dayjs().format('YYYY-MM-DD'),
    });
  }, [setDismissed]);

  if (!isEditing || !showNotice) return null;

  return (
    <ClientOnly>
      <div className="rounded-lg bg-grey-01 p-4">
        <div className="pb-4">
          <div className="flex items-center gap-8">
            <div className="-mx-4 -my-4 w-40 flex-shrink-0">
              <img src="/images/team/invite.png" alt="" className="w-full" />
            </div>
            <div className="space-y-2">
              <div className="text-smallTitle">Invite your team members to create a Geo account</div>
              <div>
                <CopyInviteLink />
              </div>
            </div>
          </div>
          <Spacer />
          <div className="flex items-center gap-8">
            <div className="-mx-4 -my-4 w-40 flex-shrink-0">
              <img src="/images/team/person-id.png" alt="" className="w-full" />
            </div>
            <div className="space-y-2">
              <div className="text-smallTitle">Ask for their person ID</div>
              <div className="text-metadata leading-[1.25]">
                For most people they’ll want to link to their personal space where their person ID can be found under
                the ... menu, however any entity with the type ‘Person’ can be used.
              </div>
            </div>
          </div>
          <Spacer />
          <div className="flex items-center gap-8">
            <div className="-mx-4 -my-4 w-40 flex-shrink-0">
              <img src="/images/team/link.png" alt="" className="w-full" />
            </div>
            <div className="space-y-2">
              <div className="text-smallTitle">Link team members who have joined or add everyone right now</div>
              <div className="text-metadata leading-[1.25]">
                Add and link team members who have joined using their person ID to verify their personal spaces as being
                legitimate. To find a team member paste their person ID into the name field. You don’t have to wait for
                them to join; you can add teammates now and link them later!
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-grey-02 pt-4 text-smallButton">
          <div>
            <button onClick={handleDismissForever} className="text-grey-03">
              Dismiss forever
            </button>
          </div>
          <div>
            <button onClick={handleDismiss} className="text-grey-04">
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </ClientOnly>
  );
};

const CopyInviteLink = () => {
  const [hasCopiedLink, setHasCopiedLink] = useState<boolean>(false);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText('https://geobrowser.io');
      setHasCopiedLink(true);
      setTimeout(() => {
        setHasCopiedLink(false);
      }, 3000);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SmallButton onClick={onCopyLink}>
      <span className={cx('absolute', !hasCopiedLink && 'invisible')}>Copied!</span>
      <span className={cx(hasCopiedLink && 'invisible')}>Copy invite link</span>
    </SmallButton>
  );
};

const Spacer = () => {
  return (
    <div className="flex">
      <div className="w-[10rem] flex-shrink-0" />
      <div className="w-full py-4">
        <hr className="h-px border-none bg-grey-02" />
      </div>
    </div>
  );
};

const getShowNotice = (dismissed: RepeatingNotice) => {
  switch (dismissed.dismissedCount) {
    case undefined:
      return true;
    case -1:
      return false;
    case 0:
      return true;
    case 1:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 1;
    case 2:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 3;
    default:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 7;
  }
};
