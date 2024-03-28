'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import Link from 'next/link';
import type { LinkProps } from 'next/link';

import * as React from 'react';
import { useCallback } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { CloseSmall } from '~/design-system/icons/close-small';

import { SpacePageType } from '~/app/space/[id]/page';
import { dismissedNoticesAtom } from '~/atoms';

type SpaceNoticesProps = {
  spaceType: SpacePageType;
  spaceId: string;
};

export const SpaceNotices = ({ spaceType, spaceId }: SpaceNoticesProps) => {
  const isEditing = useUserIsEditing(spaceId);

  if (!isEditing) return null;

  switch (spaceType) {
    case 'nonprofit':
      return (
        <AnimatedHeight className="grid grid-cols-3 gap-8">
          <Notice
            id="nonprofitFirstPost"
            color="purple"
            media={<img src="/posts.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={
              <SimpleButton href={NavUtils.toEntity(spaceId, ID.createEntityId(), SYSTEM_IDS.POST_TYPE)}>
                Write a post
              </SimpleButton>
            }
          />
          <Notice
            id="nonprofitFindOrAddProjects"
            color="blue"
            media={<img src="/projects.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Find or add projects that you’re working on`}
            action={<SimpleButton href={`/space/${spaceId}/projects`}>Find or add projects</SimpleButton>}
          />
          <Notice
            id="nonprofitAddTeamMembers"
            color="yellow"
            media={<img src="/team.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Add team members to your nonprofit`}
            action={<SimpleButton href={`/space/${spaceId}/team`}>Add team members</SimpleButton>}
          />
        </AnimatedHeight>
      );
    default:
      return null;
  }
};

type NoticeProps = {
  id: string;
  color: 'grey' | 'blue' | 'green' | 'orange' | 'purple' | 'yellow';
  media?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
};

const Notice = ({ id, color, media, title, action }: NoticeProps) => {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const classNames = cva(
    'group relative mb-8 flex aspect-square w-full flex-col justify-between overflow-clip rounded-lg p-4',
    {
      variants: {
        color: {
          purple: 'bg-gradient-purple',
          blue: 'bg-gradient-blue',
          yellow: 'bg-gradient-yellow',
          grey: 'bg-gradient-grey',
          green: 'bg-gradient-green',
          orange: 'bg-gradient-orange',
        },
      },
    }
  );

  const handleDismissNotice = useCallback(() => {
    const newDismissedNotices = [...dismissedNotices, id];
    setDismissedNotices(newDismissedNotices);
  }, [id, dismissedNotices, setDismissedNotices]);

  if (dismissedNotices.includes(id)) return null;

  return (
    <div id={id} className={classNames({ color })}>
      <div className="relative -top-1.5 -mx-4">{media}</div>
      <div>
        <div className="text-balance text-smallTitle">{title}</div>
        {action && <div className="mt-4">{action}</div>}
      </div>
      <div className="absolute right-0 top-0 p-3">
        <button
          onClick={handleDismissNotice}
          className="p-1 opacity-50 transition duration-300 ease-in-out hover:opacity-100"
        >
          <CloseSmall />
        </button>
      </div>
    </div>
  );
};

type SimpleButtonProps = LinkProps & { children: React.ReactNode };

const SimpleButton = ({ href = '', ...rest }: SimpleButtonProps) => {
  return <Link href={href} className="rounded border border-text px-2 py-1 text-smallButton text-text" {...rest} />;
};

type AnimatedHeightProps = { wrapperClassName?: string } & React.ComponentPropsWithoutRef<'div'>;

export const AnimatedHeight = ({ wrapperClassName = '', className = '', children }: AnimatedHeightProps) => {
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      const resizeObserver = new ResizeObserver(entries => {
        const observedHeight = entries[0].contentRect.height;
        setHeight(observedHeight);
      });

      resizeObserver.observe(ref.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  return (
    <motion.div
      className={cx('overflow-hidden', wrapperClassName)}
      style={{ height }}
      animate={{ height }}
      transition={{ ease: 'easeInOut', duration: 0.3 }}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </motion.div>
  );
};
