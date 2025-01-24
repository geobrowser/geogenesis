import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { getImagePath } from '~/core/utils/utils';

export function TableBlockEditableTitle({ spaceId }: { spaceId: string }) {
  const { spaces } = useSpaces();
  const userCanEdit = useUserIsEditing(spaceId);

  const { name, setName } = useDataBlock();
  const { source } = useSource();

  const hasOverflow = source.type === 'SPACES' ? source.value.length > 3 : false;
  const renderedSpaces = source.type === 'SPACES' ? (hasOverflow ? source.value.slice(0, 2) : source.value) : [];

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto focus newly created data blocks
  React.useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
  }, []);

  return (
    <div className="flex flex-grow items-center gap-2">
      {source.type === 'GEO' && (
        <img
          src={getImagePath(PLACEHOLDER_SPACE_IMAGE)}
          className="flex !size-[16px] flex-shrink-0 overflow-clip !rounded-sm border border-white object-cover"
        />
      )}
      {source.type === 'SPACES' && (
        <div className="group relative z-100 flex h-full">
          {renderedSpaces.map(spaceId => {
            const selectedSpace = spaces.find(space => space.id === spaceId);

            if (!selectedSpace) return null;

            return (
              <img
                key={selectedSpace.id}
                src={getImagePath(selectedSpace.spaceConfig?.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
                className="-ml-1.5 block !size-[16px] flex-shrink-0 overflow-clip !rounded-sm border border-white object-cover first:-ml-0"
              />
            );
          })}
          {hasOverflow && (
            <div className="relative z-10 -ml-1.5 inline-flex items-center justify-center overflow-clip rounded border-2 border-white bg-white first:-ml-0">
              <div className="bg-gradient-purple !size-[16px] !rounded-sm" />
              <div className="absolute inset-0 z-10 flex h-full w-full items-center justify-center">
                <span className="text-footnoteMedium text-text">+{source.value.length - 2}</span>
              </div>
            </div>
          )}
          <div className="absolute right-0 top-0 z-100 size-0">
            <div className="pointer-events-none absolute -top-3 left-2 z-100 flex w-60 flex-col gap-1 overflow-auto rounded-lg border border-divider bg-white p-3 opacity-0 shadow-card group-hover:pointer-events-auto group-hover:opacity-100">
              {source.value.map(spaceId => {
                const space = spaces.find(space => space.id === spaceId);

                if (!space) return null;

                return (
                  <div key={space.id} className="flex items-center gap-1.5">
                    <div className="flex-shrink-0">
                      <img
                        src={getImagePath(space.spaceConfig?.image ?? '') ?? PLACEHOLDER_SPACE_IMAGE}
                        className="!size-[16px] !rounded-sm"
                      />
                    </div>
                    <div className="flex-grow truncate text-button text-text">{space.spaceConfig?.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <MouseCatch />
        </div>
      )}
      <div className="relative z-0 w-full text-button text-text">
        {userCanEdit ? (
          <input
            ref={inputRef}
            onBlur={e => setName(e.currentTarget.value)}
            defaultValue={name ?? undefined}
            placeholder="Enter a name for this table..."
            className="w-full shrink-0 grow appearance-none text-smallTitle text-text outline-none placeholder:text-grey-03"
          />
        ) : (
          <h4 className="text-smallTitle">{name}</h4>
        )}
      </div>
    </div>
  );
}

const MouseCatch = () => (
  <div className="pointer-events-none absolute left-0 top-0 z-0 aspect-[2/1] w-60 group-hover:pointer-events-auto" />
);
