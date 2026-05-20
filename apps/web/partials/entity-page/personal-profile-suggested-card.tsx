'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useSetAtom } from 'jotai';
import { usePathname, useRouter } from 'next/navigation';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { useEditable } from '~/core/state/editable-store';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { ensureProfilePageTab, runPersonalPostCreationFlow } from '~/core/utils/personal-post-flow';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton, SquareButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { CreateSmall } from '~/design-system/icons/create-small';
import { Menu, MenuItem } from '~/design-system/menu';

import { PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY } from '~/partials/entity-page/personal-profile-bio-starter';

import {
  PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY,
  clearPersonalProfileSessionDismissStorage,
  pendingCreatePostSidePanelAtom,
  personalProfileBioStarterTriggerAtom,
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
} from '~/atoms/personal-profile-suggested';

export function personalSpaceIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.trim().replace(/^0x/i, '').replace(/-/g, '').toLowerCase();
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
  const displayName = entityName?.trim() || profileBySpaceQuery.data?.name?.trim() || profile?.name?.trim() || 'there';

  const identityReady =
    !address ||
    (personalSpaceFetched && geoProfileFetched && (!isMyPersonalSpaceRoute || profileBySpaceQuery.isFetched));

  const [dismiss, setDismiss] = useAtom(personalProfileSuggestedDismissAtom);
  const [tasks] = useAtom(personalProfileSuggestedTasksAtom);
  const [sessionDismissed, setSessionDismissed] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [createPostPending, setCreatePostPending] = React.useState(false);
  const createPostLockedRef = React.useRef(false);
  const setPendingCreatePostSidePanel = useSetAtom(pendingCreatePostSidePanelAtom);

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

  const isOwner = Boolean(personalSpaceId && isMyPersonalSpaceRoute && resolvedPersonEntityId && isOwnPersonProfile);

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

  const suggestedActionPillTypography = '!text-[16px] !leading-[13px] !tracking-[-0.25px] !font-normal';

  const pillSizing = '!h-7 !px-2.5 !gap-1.5 !rounded-full';

  const pillClass = `${pillSizing} !border-transparent !bg-[#151515E6] !text-white [&:hover]:!bg-[#151515E6] [&:hover]:!text-white [&:hover]:!border-transparent focus-visible:!border-text [&]:shadow-none`;

  const donePillClass = `${pillSizing} !border-transparent !bg-[#8A8A8A] !text-white hover:!bg-[#8A8A8A] hover:!text-white hover:!border-transparent active:!bg-[#8A8A8A] focus-visible:!border-transparent focus-visible:!bg-[#8A8A8A] focus-visible:!shadow-none [&]:shadow-none !cursor-default`;

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
        focusFindCreateInput: true,
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
      focusFindCreateInput: true,
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
  }, [bumpBioStarterMerge, displayName, entityId, onProfileOverviewSurface, router, setEditable, spaceId]);

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
      const postsTabEntityId = ensureProfilePageTab(entityId, spaceId, 'Posts');

      const profilePathname = isMyPersonalSpaceRoute
        ? NavUtils.toSpace(spaceId)
        : NavUtils.toEntity(spaceId, entityId, false);

      setPendingCreatePostSidePanel({
        postEntityId,
        spaceId,
        profileEntityId: entityId,
        postsTabEntityId,
        profilePathname,
      });

      const postsTabUrl = `${profilePathname}?tabId=${postsTabEntityId}`;
      setEditable(true);

      try {
        const nav = router.push(postsTabUrl, { scroll: false }) as void | Promise<unknown>;
        if (nav != null && typeof (nav as Promise<unknown>).catch === 'function') {
          void (nav as Promise<unknown>).catch(() => {});
        }
      } catch {
        setPendingCreatePostSidePanel(null);
      }
    } catch (e) {
      console.error('[PersonalProfileSuggestedCard] create post failed', e);
    } finally {
      createPostLockedRef.current = false;
      setCreatePostPending(false);
    }
  }, [
    displayName,
    entityId,
    isMyPersonalSpaceRoute,
    router,
    setEditable,
    setPendingCreatePostSidePanel,
    spaceId,
  ]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="relative mb-10 min-h-[173px] overflow-hidden rounded-lg bg-[#dbe9c6] bg-cover bg-right bg-no-repeat"
      style={{ backgroundImage: `url('/personal-profile/suggested-card-leaves.png')` }}
    >
      <div className="absolute top-6 right-6 z-20">
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

      <div className="relative z-10 flex h-full flex-col p-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-calibre text-[24px] leading-[29px] font-semibold tracking-[-0.75px] text-[#151515]">
            Get started
          </h2>
          <p className="font-calibre text-[16px] leading-[13px] font-normal tracking-[-0.25px] text-[#151515]">
            Kick things off with these quick setup actions.
          </p>
        </div>
        <div className="mt-12 flex flex-wrap gap-2">
          <SmallButton
            variant="secondary"
            className={`${suggestedActionPillTypography} ${tasks.bio ? donePillClass : pillClass}`}
            icon={tasks.bio ? <Check color="white" /> : <CreateSmall />}
            disabled={tasks.bio}
            onClick={tasks.bio ? undefined : onAddBio}
          >
            Add bio
          </SmallButton>
          <SmallButton
            variant="secondary"
            className={`${suggestedActionPillTypography} ${tasks.skills ? donePillClass : pillClass}`}
            icon={tasks.skills ? <Check color="white" /> : <CreateSmall />}
            disabled={tasks.skills}
            onClick={tasks.skills ? undefined : onAddSkills}
          >
            Add skills
          </SmallButton>
          <SmallButton
            variant="secondary"
            className={`${suggestedActionPillTypography} ${tasks.post ? donePillClass : pillClass}`}
            icon={tasks.post ? <Check color="white" /> : <CreateSmall />}
            aria-busy={createPostPending && !tasks.post}
            disabled={tasks.post}
            onClick={tasks.post ? undefined : () => void onCreatePost()}
          >
            Create post
          </SmallButton>
        </div>
      </div>
    </div>
  );
}
