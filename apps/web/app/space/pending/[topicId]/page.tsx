'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import { useParams, useRouter } from 'next/navigation';

import { useHydrated } from '~/core/hooks/use-hydrated';
import { useEditable } from '~/core/state/editable-store';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { pendingPersonalSpaceId, usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { FallbackImage } from '~/design-system/fallback-image';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { Editor } from '~/partials/editor/editor';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { avatarAtom, nameAtom, spaceIdAtom } from '~/partials/onboarding/dialog';

/**
 * Optimistic personal-space page. The space doesn't exist on the indexer yet —
 * `createPersonalSpace` is running in the background (PendingPersonalSpaceRunner).
 * We render an editable overview wired to the local store under the `pending:`
 * sentinel so the user can start filling in their profile immediately. When the
 * real spaceId lands, the runner remaps the edits and swaps the URL to the real
 * space; this page also redirects itself if it's ever visited post-resolution.
 */
export default function PendingPersonalSpacePage() {
  const params = useParams<{ topicId: string }>();
  const topicId = params?.topicId ?? '';
  const spaceId = pendingPersonalSpaceId(topicId);

  const router = useRouter();
  const hydrated = useHydrated();
  const { isPending, topicId: pendingTopicId } = usePendingPersonalSpace();
  const resolvedSpaceId = useAtomValue(spaceIdAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const { setEditable } = useEditable();

  const isThisPending = isPending && pendingTopicId === topicId;

  // Drop the user straight into edit mode — the whole point of the page is to
  // start authoring while the space resolves.
  React.useEffect(() => {
    if (isThisPending) setEditable(true);
  }, [isThisPending, setEditable]);

  // If the space already resolved (or there's no matching pending job), this
  // page is stale — send the user to the real space, else explore. Wait for
  // hydration so the persisted pending atom is read before we decide.
  React.useEffect(() => {
    if (!hydrated || isThisPending) return;
    router.replace(resolvedSpaceId ? NavUtils.toSpace(resolvedSpaceId) : NavUtils.toExplore());
  }, [hydrated, isThisPending, resolvedSpaceId, router]);

  if (!hydrated || !isThisPending) return null;

  return (
    <EntityStoreProvider id={topicId} spaceId={spaceId}>
      <EditorProvider id={topicId} spaceId={spaceId} initialBlocks={[]} initialBlockRelations={[]}>
        <EntityPageContentContainer>
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-grey-01">
              {avatar ? (
                <FallbackImage value={avatar} sizes="48px" className="object-cover" />
              ) : (
                <Avatar value={topicId} size={48} square />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Text as="h1" variant="mainPage" className="truncate">
                {name || 'Your personal space'}
              </Text>
            </div>
          </div>

          <Spacer height={12} />

          <div className="inline-flex items-center gap-2 rounded-md bg-grey-01 px-3 py-1.5 text-metadataMedium text-grey-04">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" />
            Finishing account setup… you can start editing now.
          </div>

          <Spacer height={40} />

          <Editor
            spaceId={spaceId}
            placeholder={<p className="text-body text-grey-04">There is no overview here yet.</p>}
          />
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}
