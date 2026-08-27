'use client';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { isPersonalProfileSkillsRelationFocusRegionActive } from '~/core/utils/personal-profile-skills-focus';

import { NativeGeoImage } from '~/design-system/geo-image';

type Props = {
  spaceId: string;
  trailing?: React.ReactNode;
};

export function TableBlockEditableTitle({ spaceId, trailing }: Props) {
  const { name, setName, isLoading } = useDataBlock();
  const { filterState, setFilterState } = useFilters();
  const { source } = useSource({ filterState, setFilterState });
  const { spacesById } = useSpacesByIds(source.type === 'SPACES' ? source.value : []);
  const userCanEdit = useUserIsEditing(spaceId);

  const hasOverflow = source.type === 'SPACES' ? source.value.length > 3 : false;
  const renderedSpaces = source.type === 'SPACES' ? (hasOverflow ? source.value.slice(0, 2) : source.value) : [];

  const titlePlaceholder =
    source.type === 'COLLECTION'
      ? 'Collection name...'
      : source.type === 'GEO' || source.type === 'SPACES'
        ? 'Query name...'
        : 'Enter a name for this table...';

  const [draftName, setDraftName] = React.useState(name ?? '');
  React.useEffect(() => {
    setDraftName(name ?? '');
  }, [name]);

  const inputRef = useAutofocus<HTMLInputElement>(!isLoading && !name, 200, {
    shouldSkipFocus: isPersonalProfileSkillsRelationFocusRegionActive,
  });

  const measureText = draftName.length > 0 ? draftName : titlePlaceholder;

  return (
    <div className="table-block-editable-title flex w-fit max-w-full shrink-0 items-center gap-2">
      {source.type === 'SPACES' && (
        <div className="group relative z-10 flex h-full shrink-0">
          {renderedSpaces.map(spaceId => {
            const selectedSpace = spacesById.get(spaceId);

            if (!selectedSpace) return null;

            return selectedSpace.entity?.image ? (
              <NativeGeoImage
                key={selectedSpace.id}
                value={selectedSpace.entity.image}
                className="-ml-1.5 block size-[16px]! shrink-0 overflow-clip rounded-sm! border border-white object-cover first:ml-0"
              />
            ) : (
              <img
                key={selectedSpace.id}
                src={PLACEHOLDER_SPACE_IMAGE}
                alt=""
                className="-ml-1.5 block size-[16px]! shrink-0 overflow-clip rounded-sm! border border-white object-cover first:ml-0"
              />
            );
          })}
          {hasOverflow && (
            <div className="relative z-10 -ml-1.5 inline-flex size-[16px]! shrink-0 items-center justify-center overflow-clip rounded-sm! border border-white bg-gradient-purple first:ml-0">
              <span className="text-footnoteMedium text-text">+{source.value.length - 2}</span>
            </div>
          )}
          <div className="absolute top-0 right-0 z-100 size-0">
            <div className="pointer-events-none absolute -top-3 left-2 z-100 flex w-60 flex-col gap-1 overflow-auto rounded-lg border border-divider bg-white p-3 opacity-0 shadow-card group-hover:pointer-events-auto group-hover:opacity-100">
              {source.value.map(spaceId => {
                const space = spacesById.get(spaceId);

                if (!space) return null;

                return (
                  <div key={space.id} className="flex items-center gap-1.5">
                    <div className="shrink-0">
                      {space.entity?.image ? (
                        <NativeGeoImage value={space.entity.image} className="size-[16px]! rounded-sm!" />
                      ) : (
                        <img src={PLACEHOLDER_SPACE_IMAGE} alt="" className="size-[16px]! rounded-sm!" />
                      )}
                    </div>
                    <div className="grow truncate text-button text-text">{space.entity?.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <MouseCatch />
        </div>
      )}

      <div className="relative z-0 w-fit max-w-full text-button text-text">
        {userCanEdit ? (
          <div className="inline-grid w-fit max-w-full [grid-template-columns:minmax(0,max-content)]">
            <span aria-hidden className="invisible col-start-1 row-start-1 text-mediumTitle whitespace-pre">
              {measureText}
            </span>
            <input
              type="text"
              ref={inputRef}
              // Override the browser default size=20 min-width so the mirror span
              // alone controls width (otherwise short titles leave a large gap).
              size={1}
              value={draftName}
              onChange={e => setDraftName(e.currentTarget.value)}
              onBlur={e => setName(e.currentTarget.value)}
              placeholder={titlePlaceholder}
              className="col-start-1 row-start-1 w-full min-w-0 appearance-none bg-transparent text-mediumTitle text-text outline-hidden placeholder:text-grey-03"
            />
          </div>
        ) : (
          <h4 className="w-fit max-w-full truncate text-mediumTitle">{name}</h4>
        )}
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

const MouseCatch = () => (
  <div className="pointer-events-none absolute top-0 left-0 z-0 aspect-2/1 w-60 group-hover:pointer-events-auto" />
);
