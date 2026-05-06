'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useAtom, useSetAtom } from 'jotai';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { ensureProfilePageTab, runPersonalPostCreationFlow } from '~/core/utils/personal-post-flow';
import { NavUtils } from '~/core/utils/utils';

import {
  ENTITY_PAGE_SURFACE_POST_VALUE,
  ENTITY_PAGE_SURFACE_QUERY_KEY,
} from '~/partials/entity-page/entity-page-surface';

import { SmallButton, SquareButton } from '~/design-system/button';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { Menu, MenuItem } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import {
  clearPersonalProfileSessionDismissStorage,
  PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY,
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
} from '~/atoms/personal-profile-suggested';
import { PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY } from '~/partials/entity-page/personal-profile-bio-starter';

/**
 * Same logical id across `0x` prefixes, casing, and hyphenation (space ids vs UUID entity ids).
 */
export function personalSpaceIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s
      .trim()
      .replace(/^0x/i, '')
      .replace(/-/g, '')
      .toLowerCase();
  return norm(a) === norm(b);
}

type Props = {
  spaceId: string;
  entityId: string;
};

export function PersonalProfileSuggestedCard({ spaceId, entityId }: Props) {
  const router = useRouter();
  const setSuggestedTasks = useSetAtom(personalProfileSuggestedTasksAtom);
  const pathname = usePathname();
  const canEdit = useUserIsEditing(spaceId);
  const setSkillsRowIntent = useSetAtom(personalProfileSkillsRowIntentAtom);
  const { personalSpaceId, isFetched: personalSpaceFetched } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile, isFetched: geoProfileFetched } = useGeoProfile(address);

  const isMyPersonalSpaceRoute = personalSpaceIdsEqual(personalSpaceId, spaceId);

  const profileBySpaceQuery = useQuery({
    queryKey: ['personal-profile-suggested', 'profile-by-space', spaceId, address],
    queryFn: () => Effect.runPromise(fetchProfileBySpaceId(spaceId, address)),
    enabled: Boolean(address && isMyPersonalSpaceRoute),
    staleTime: 60_000,
  });

  const resolvedPersonEntityId = profileBySpaceQuery.data?.id ?? profile?.id;
  const isOwnPersonProfile = personalSpaceIdsEqual(resolvedPersonEntityId, entityId);

  const entityName = useName(entityId, spaceId);
  const displayName =
    entityName?.trim() ||
    profileBySpaceQuery.data?.name?.trim() ||
    profile?.name?.trim() ||
    'there';

  const identityReady =
    !address ||
    (personalSpaceFetched &&
      geoProfileFetched &&
      (!isMyPersonalSpaceRoute || profileBySpaceQuery.isFetched));

  const [dismiss, setDismiss] = useAtom(personalProfileSuggestedDismissAtom);
  const [tasks] = useAtom(personalProfileSuggestedTasksAtom);
  const [sessionDismissed, setSessionDismissed] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [createPostPending, setCreatePostPending] = React.useState(false);

  const sessionDismissStorageKey = React.useMemo(() => {
    if (!address) return null;
    return `${PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY}:${address.toLowerCase()}`;
  }, [address]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !mounted) return;
    if (!address) {
      clearPersonalProfileSessionDismissStorage();
      setSessionDismissed(false);
      return;
    }
    const key = `${PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY}:${address.toLowerCase()}`;
    setSessionDismissed(sessionStorage.getItem(key) === '1');
  }, [address, mounted]);

  const isOwner = Boolean(
    personalSpaceId && isMyPersonalSpaceRoute && resolvedPersonEntityId && isOwnPersonProfile
  );

  const allTasksDone =
    tasks.bio && tasks.work && tasks.education && tasks.skills && tasks.post;

  const visible =
    mounted &&
    identityReady &&
    isOwner &&
    !dismiss.forever &&
    !sessionDismissed &&
    isMyPersonalSpaceRoute &&
    !allTasksDone;

  const showDismissForeverInMenu = dismiss.softDismissCount >= 1;

  const pillClass =
    'border-transparent !bg-text !text-white hover:!bg-text/90 focus-visible:!border-text [&]:shadow-none';

  const donePillClass =
    'border-transparent !bg-grey-03 !text-white hover:!bg-grey-03 focus-visible:!border-grey-03 [&]:shadow-none';

  const onDismissSession = React.useCallback(() => {
    if (sessionDismissStorageKey) {
      sessionStorage.setItem(sessionDismissStorageKey, '1');
    }
    setSessionDismissed(true);
    setDismiss(d => ({ ...d, softDismissCount: d.softDismissCount + 1 }));
    setMenuOpen(false);
  }, [sessionDismissStorageKey, setDismiss]);

  const onDismissForever = React.useCallback(() => {
    setDismiss(d => ({ ...d, forever: true }));
    clearPersonalProfileSessionDismissStorage();
    setSessionDismissed(false);
    setMenuOpen(false);
  }, [setDismiss]);

  const onJumpProfileEdit = React.useCallback(() => {
    router.push(NavUtils.toEntity(spaceId, entityId, true));
  }, [entityId, router, spaceId]);

  const onAddEducation = React.useCallback(() => {
    const tabId = ensureProfilePageTab(entityId, spaceId, 'Education');
    setSuggestedTasks(t => ({ ...t, education: true }));
    router.push(
      NavUtils.toEntity(spaceId, entityId, true, undefined, {
        tabId,
      })
    );
  }, [entityId, router, setSuggestedTasks, spaceId]);

  const onAddSkills = React.useCallback(() => {
    const profilePath = NavUtils.toEntity(spaceId, entityId, false);
    const spaceHomePath = NavUtils.toSpace(spaceId);

    const onThisPersonSurface =
      pathname === profilePath ||
      pathname === `${profilePath}/` ||
      pathname === spaceHomePath ||
      pathname === `${spaceHomePath}/`;

    if (!onThisPersonSurface) {
      setSkillsRowIntent({
        entityId,
        spaceId,
        focusFindCreateInput: false,
        pendingEnableEdit: true,
      });
      try {
        const nav = router.push(profilePath) as void | Promise<unknown>;
        if (nav != null && typeof (nav as Promise<unknown>).catch === 'function') {
          void (nav as Promise<unknown>).catch(() => {});
        }
      } catch {
        /* ignore */
      }
      return;
    }

    if (canEdit) {
      setSkillsRowIntent({
        entityId,
        spaceId,
        focusFindCreateInput: true,
        pendingEnableEdit: false,
      });
      return;
    }

    setSkillsRowIntent({
      entityId,
      spaceId,
      focusFindCreateInput: false,
      pendingEnableEdit: true,
    });
  }, [canEdit, entityId, pathname, router, setSkillsRowIntent, spaceId]);

  const onAddBio = React.useCallback(() => {
    sessionStorage.setItem(
      PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY,
      JSON.stringify({
        kind: 'bio' as const,
        displayName,
        targetSpaceId: spaceId,
        targetEntityId: entityId,
      })
    );
    router.push(NavUtils.toEntity(spaceId, entityId, true));
  }, [displayName, entityId, router, spaceId]);

  const onCreatePost = React.useCallback(async () => {
    if (createPostPending) return;
    setCreatePostPending(true);
    try {
      const postEntityId = await runPersonalPostCreationFlow({
        spaceId,
        profileEntityId: entityId,
        authorDisplayName: displayName,
      });
      setSuggestedTasks(t => ({ ...t, post: true }));
      router.push(
        NavUtils.toEntity(spaceId, postEntityId, true, undefined, {
          [ENTITY_PAGE_SURFACE_QUERY_KEY]: ENTITY_PAGE_SURFACE_POST_VALUE,
        })
      );
    } catch (e) {
      console.error('[PersonalProfileSuggestedCard] create post failed', e);
    } finally {
      setCreatePostPending(false);
    }
  }, [createPostPending, displayName, entityId, router, setSuggestedTasks, spaceId]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="relative mt-6 mb-6 overflow-hidden rounded-xl border border-grey-02 bg-cover bg-center bg-no-repeat shadow-button"
      style={{ backgroundImage: `url('/placeholder-cover.png')` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/95 to-emerald-50/80" />

      <div className="relative z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="smallTitle" className="text-text">
            Suggested for you
          </Text>
          <Text as="p" variant="metadata" className="mt-1 text-grey-04">
            Kick things off with these quick setup actions.
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            <SmallButton
              variant="secondary"
              className={tasks.bio ? donePillClass : pillClass}
              icon={tasks.bio ? <CheckCircleSmall color="white" /> : undefined}
              disabled={tasks.bio}
              onClick={tasks.bio ? undefined : onAddBio}
            >
              {tasks.bio ? 'Add bio' : '+ Add bio'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={tasks.work ? donePillClass : pillClass}
              icon={tasks.work ? <CheckCircleSmall color="white" /> : undefined}
              disabled={tasks.work}
              onClick={tasks.work ? undefined : onJumpProfileEdit}
            >
              {tasks.work ? 'Add work history' : '+ Add work history'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={tasks.education ? donePillClass : pillClass}
              icon={tasks.education ? <CheckCircleSmall color="white" /> : undefined}
              disabled={tasks.education}
              onClick={tasks.education ? undefined : onAddEducation}
            >
              {tasks.education ? 'Add education' : '+ Add education'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={tasks.skills ? donePillClass : pillClass}
              icon={tasks.skills ? <CheckCircleSmall color="white" /> : undefined}
              disabled={tasks.skills}
              onClick={tasks.skills ? undefined : onAddSkills}
            >
              {tasks.skills ? 'Add skills' : '+ Add skills'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={tasks.post ? donePillClass : pillClass}
              icon={tasks.post ? <CheckCircleSmall color="white" /> : undefined}
              disabled={tasks.post || createPostPending}
              onClick={tasks.post || createPostPending ? undefined : () => void onCreatePost()}
            >
              {tasks.post ? 'Create post' : '+ Create post'}
            </SmallButton>
          </div>
        </div>

        <div className="flex shrink-0 justify-end self-start">
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            asChild
            trigger={
              <SquareButton
                icon={<span className="text-[1.125rem] leading-none text-text">⋯</span>}
                aria-label="Suggested card menu"
              />
            }
          >
            <MenuItem onClick={onDismissSession}>Dismiss</MenuItem>
            {showDismissForeverInMenu ? <MenuItem onClick={onDismissForever}>Dismiss forever</MenuItem> : null}
          </Menu>
        </div>
      </div>
    </div>
  );
}
