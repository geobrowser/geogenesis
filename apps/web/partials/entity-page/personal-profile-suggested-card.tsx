'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useAtom, useSetAtom } from 'jotai';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { runPersonalPostCreationFlow } from '~/core/utils/personal-post-flow';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton, SquareButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { Menu, MenuItem } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import {
  clearPersonalProfileSessionDismissStorage,
  personalProfileBioStarterTriggerAtom,
  PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY,
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
} from '~/atoms/personal-profile-suggested';
import { PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY } from '~/partials/entity-page/personal-profile-bio-starter';

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
  const { setEditable } = useEditable();
  const bumpBioStarterMerge = useSetAtom(personalProfileBioStarterTriggerAtom);
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
  const createPostLockedRef = React.useRef(false);

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

  const allTasksDone = tasks.bio && tasks.skills && tasks.post;

  const visible =
    mounted &&
    identityReady &&
    isOwner &&
    !dismiss.forever &&
    !sessionDismissed &&
    isMyPersonalSpaceRoute &&
    !allTasksDone;

  const showDismissForeverInMenu = dismiss.softDismissCount >= 1;

  /** Space home or canonical profile entity URL — avoid `…/entity?edit=true` (SSR redirects to space home after edit strip). */
  const onProfileOverviewSurface = React.useMemo(() => {
    const profilePath = NavUtils.toEntity(spaceId, entityId, false);
    const spaceHomePath = NavUtils.toSpace(spaceId);
    return (
      pathname === profilePath ||
      pathname === `${profilePath}/` ||
      pathname === spaceHomePath ||
      pathname === `${spaceHomePath}/`
    );
  }, [pathname, spaceId, entityId]);

  // Dark fills at rest; on hover only lighten the background so `secondary`’s `hover:text-text` stays readable.
  const pillClass =
    'border-transparent !bg-text !text-white hover:!bg-bg focus-visible:!border-text [&]:shadow-none';

  const donePillClass =
    'border-transparent !bg-[#15151580] !text-white hover:!bg-[#15151580] hover:!text-white hover:!border-transparent active:!bg-[#15151580] focus-visible:!border-transparent focus-visible:!bg-[#15151580] focus-visible:!shadow-none [&]:shadow-none !cursor-default';

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

  const onAddSkills = React.useCallback(() => {
    if (!onProfileOverviewSurface) {
      setSkillsRowIntent({
        entityId,
        spaceId,
        focusFindCreateInput: false,
        pendingEnableEdit: true,
      });
      try {
        const nav = router.push(NavUtils.toEntity(spaceId, entityId, false)) as void | Promise<unknown>;
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
  }, [canEdit, entityId, onProfileOverviewSurface, router, setSkillsRowIntent, spaceId]);

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
    if (onProfileOverviewSurface) {
      setEditable(true);
      bumpBioStarterMerge(n => n + 1);
      return;
    }
    try {
      const nav = router.push(NavUtils.toEntity(spaceId, entityId, true), { scroll: false }) as void | Promise<unknown>;
      if (nav != null && typeof (nav as Promise<unknown>).catch === 'function') {
        void (nav as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [
    bumpBioStarterMerge,
    displayName,
    entityId,
    onProfileOverviewSurface,
    router,
    setEditable,
    spaceId,
  ]);

  const onCreatePost = React.useCallback(async () => {
    if (createPostLockedRef.current) return;
    createPostLockedRef.current = true;
    setCreatePostPending(true);
    try {
      const postEntityId = await runPersonalPostCreationFlow({
        spaceId,
        profileEntityId: entityId,
        authorDisplayName: displayName,
      });
      setSuggestedTasks(t => ({ ...t, post: true }));
      router.push(NavUtils.toEntity(spaceId, postEntityId, true));
    } catch (e) {
      console.error('[PersonalProfileSuggestedCard] create post failed', e);
    } finally {
      createPostLockedRef.current = false;
      setCreatePostPending(false);
    }
  }, [displayName, entityId, router, setSuggestedTasks, spaceId]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="relative mt-6 mb-6 overflow-hidden rounded-xl border border-grey-02 bg-cover bg-center bg-no-repeat shadow-button"
      style={{ backgroundImage: `url('/placeholder-cover.png')` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/95 to-emerald-50/80" />

      <div className="relative z-10 flex flex-col gap-3 p-4 pt-4 pr-14 sm:pr-16">
        <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
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

        <div className="min-w-0 flex-1">
          <Text as="h2" variant="smallTitle" className="text-text !text-[24px] !leading-[28px]">
            Suggested for you
          </Text>
          <Text as="p" variant="metadata" className="mt-1 text-grey-04 !text-[14px] !leading-[18px]">
            Kick things off with these quick setup actions.
          </Text>
          <div className="mt-[98px] flex flex-wrap gap-2">
            <SmallButton
              variant="secondary"
              className={tasks.bio ? donePillClass : pillClass}
              icon={tasks.bio ? <Check color="white" className="size-3 shrink-0" /> : undefined}
              disabled={tasks.bio}
              onClick={tasks.bio ? undefined : onAddBio}
            >
              {tasks.bio ? 'Add bio' : '+ Add bio'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={tasks.skills ? donePillClass : pillClass}
              icon={tasks.skills ? <Check color="white" className="size-3 shrink-0" /> : undefined}
              disabled={tasks.skills}
              onClick={tasks.skills ? undefined : onAddSkills}
            >
              {tasks.skills ? 'Add skills' : '+ Add skills'}
            </SmallButton>
            <SmallButton
              variant="secondary"
              className={`${tasks.post ? donePillClass : pillClass}${createPostPending && !tasks.post ? '' : ''}`}
              icon={tasks.post ? <Check color="white" className="size-3 shrink-0" /> : undefined}
              aria-busy={createPostPending && !tasks.post}
              disabled={tasks.post}
              onClick={tasks.post ? undefined : () => void onCreatePost()}
            >
              {tasks.post ? 'Create post' : '+ Create post'}
            </SmallButton>
          </div>
        </div>
      </div>
    </div>
  );
}
