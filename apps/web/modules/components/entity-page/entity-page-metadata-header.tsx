import { EntityType, Version } from '~/modules/types';
import { HistoryItem, HistoryPanel } from '../history';
import { A, pipe } from '@mobily/ts-belt';
import { EntityPageTypeChip } from './entity-page-type-chip';

interface Props {
  versions: Array<Version>;
  types: Array<EntityType>;
}

export function EntityPageMetadataHeader({ versions, types }: Props) {
  // Parse all contributors to this page uniquely by their id. Try and
  // use their name, if they don't have one use their wallet address.
  const contributors = pipe(
    versions,
    A.uniqBy(v => v.createdBy.id),
    A.flatMap(version => version.createdBy)
  );

  return (
    <div>
      <div className="flex items-center justify-between text-text">
        <ul className="flex items-center gap-1">
          {types.map(t => (
            <li key={t.id}>
              <EntityPageTypeChip type={t} />
            </li>
          ))}
        </ul>

        {contributors.length > 0 && (
          <HistoryPanel>
            {versions.map(version => (
              <HistoryItem key={version.id} version={version} />
            ))}
          </HistoryPanel>
        )}
      </div>
    </div>
  );
}
