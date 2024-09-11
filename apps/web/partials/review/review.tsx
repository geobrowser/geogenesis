'use client';

import { useQuery } from '@tanstack/react-query';
import pluralize from 'pluralize';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useTriples } from '~/core/database/triples';
import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { usePublish } from '~/core/hooks/use-publish';
import { SpaceId } from '~/core/io/schema';
import { fetchSpacesById } from '~/core/io/subgraph/fetch-spaces-by-id';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { getImagePath } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { Blank } from '~/design-system/icons/blank';
import { Close } from '~/design-system/icons/close';
import { Dash } from '~/design-system/icons/dash';
import { Tick } from '~/design-system/icons/tick';
import { SlideUp } from '~/design-system/slide-up';

import { ChangedEntity } from '../diff/changed-entity';

export const Review = () => {
  const { isReviewOpen, setIsReviewOpen } = useDiff();

  return (
    <SlideUp isOpen={isReviewOpen} setIsOpen={setIsReviewOpen}>
      <ReviewChanges />
    </SlideUp>
  );
};

type Proposals = Record<PropertyKey, Proposal>;

type Proposal = {
  name: string;
  description: string;
};

const ReviewChanges = () => {
  const { state } = useStatusBar();
  const { setIsReviewOpen, activeSpace, setActiveSpace } = useDiff();

  const allSpacesWithActions = useTriples(
    React.useMemo(() => {
      return {
        selector: t => t.hasBeenPublished === false,
      };
    }, [])
  ).map(t => t.space);

  const dedupedSpacesWithActions = React.useMemo(() => {
    return [...new Set(allSpacesWithActions).values()];
  }, [allSpacesWithActions]);

  const { data: spaces, isLoading: isSpacesLoading } = useQuery({
    queryKey: ['spaces-in-review', dedupedSpacesWithActions],
    queryFn: async () => {
      const maybeSpaces = await fetchSpacesById(dedupedSpacesWithActions);

      const spaces = maybeSpaces.filter(s => s.spaceConfig !== null);

      const spacesMap = new Map<string, { id: string; name: string | null; image: string | null }>();

      for (const space of spaces) {
        const id = space.id;
        const config = space.spaceConfig;
        const image = config ? getImagePath(config.image) : PLACEHOLDER_SPACE_IMAGE;

        spacesMap.set(id, {
          id,
          name: config.name,
          image,
        });
      }

      return spacesMap;
    },
  });

  // Set a new default active space when active spaces change
  useEffect(() => {
    if (
      dedupedSpacesWithActions.length === 0 &&
      state.reviewState !== 'publish-complete' &&
      state.reviewState !== 'publishing-contract'
    ) {
      setIsReviewOpen(false);
    } else {
      setActiveSpace(dedupedSpacesWithActions[0] ?? '');
    }
  }, [dedupedSpacesWithActions, setActiveSpace, setIsReviewOpen, state.reviewState]);

  // Options for space selector dropdown
  const options = dedupedSpacesWithActions.map(spaceId => ({
    value: spaceId,
    label: (
      <span className="inline-flex items-center gap-2 text-button text-text">
        <span className="relative h-4 w-4 overflow-hidden rounded-sm">
          <img
            src={spaces?.get(spaceId)?.image ?? undefined}
            className="absolute inset-0 h-full w-full object-cover object-center"
            alt=""
          />
        </span>
        <span>{spaces?.get(spaceId)?.name}</span>
      </span>
    ),
    disabled: activeSpace === spaceId,
    onClick: () => setActiveSpace(spaceId),
  }));

  // Proposal state
  const [proposals, setProposals] = useState<Proposals>({});
  const proposalName = proposals[activeSpace]?.name?.trim() ?? '';
  const isReadyToPublish = proposalName?.length > 3;
  const [unstagedChanges, setUnstagedChanges] = useState<Record<string, Record<string, boolean>>>({});

  const triplesFromSpace = useTriples(
    React.useMemo(() => {
      return {
        selector: t => t.space === activeSpace,
      };
    }, [activeSpace])
  );

  const { makeProposal } = usePublish();
  const [changes, isLoading] = useLocalChanges(activeSpace);

  const handlePublish = useCallback(async () => {
    if (!activeSpace) return;

    const clearProposalName = () => {
      setProposals({ ...proposals, [activeSpace]: { name: '', description: '' } });
    };

    // @TODO: Selectable publishing
    // const [actionsToPublish] = Action.splitActions(actionsFromSpace, unstagedChanges);

    await makeProposal({
      triples: triplesFromSpace,
      spaceId: activeSpace,
      name: proposalName,
      onSuccess: () => {
        clearProposalName();
      },
    });
  }, [activeSpace, proposalName, proposals, makeProposal, triplesFromSpace]);

  if (isLoading || !changes || isSpacesLoading) {
    return <div>Loading...</div>;
  }

  const totalChanges = changes.length;
  const totalEdits = changes.flatMap(c => c.changes).length;

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsReviewOpen(false)} icon={<Close />} />
          {dedupedSpacesWithActions.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-metadataMedium leading-none">Review your edits in</span>
              {dedupedSpacesWithActions.length === 1 && (
                <span className="inline-flex items-center gap-2 text-button text-text ">
                  <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <img
                      src={spaces?.get(activeSpace)?.image ?? undefined}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      alt=""
                    />
                  </span>
                  <span>{spaces?.get(activeSpace)?.name}</span>
                </span>
              )}
              {dedupedSpacesWithActions.length > 1 && (
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-2">
                      <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                        <img
                          src={spaces?.get(activeSpace)?.image ?? undefined}
                          className="absolute inset-0 h-full w-full object-cover object-center"
                          alt=""
                        />
                      </span>
                      <span>{spaces?.get(activeSpace)?.name}</span>
                    </span>
                  }
                  align="start"
                  options={options}
                />
              )}
            </div>
          )}
        </div>
        <div>
          <Button onClick={handlePublish} disabled={!isReadyToPublish}>
            Publish
          </Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          <div className="relative flex flex-col gap-16">
            <div className="absolute right-0 top-0 flex items-center gap-8">
              <div className="inline-flex items-center gap-2">
                <span>
                  <span className="font-medium">
                    {totalEdits} {pluralize('edit', totalEdits)}
                  </span>{' '}
                  selected to publish
                </span>
                <SquareButton
                  icon={totalEdits === 0 ? <Blank /> : totalEdits === totalChanges ? <Tick /> : <Dash />}
                  onClick={() => setUnstagedChanges({})}
                />
              </div>
              <div>
                <SmallButton
                  onClick={() => {
                    // @TODO(database)
                  }}
                >
                  Delete all
                </SmallButton>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-body">Proposal name</div>
              <input
                type="text"
                value={proposals[activeSpace]?.name ?? ''}
                onChange={({ currentTarget }) =>
                  setProposals({
                    ...proposals,
                    [activeSpace]: { ...proposals[activeSpace], name: currentTarget.value },
                  })
                }
                placeholder="Name your proposal..."
                className="bg-transparent text-3xl font-semibold text-text placeholder:text-grey-02 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-16 divide-y divide-grey-02">
              {changes.map(change => (
                <ChangedEntity
                  key={change.id}
                  change={change}
                  // unstagedChanges={unstagedChanges}
                  // setUnstagedChanges={setUnstagedChanges}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
