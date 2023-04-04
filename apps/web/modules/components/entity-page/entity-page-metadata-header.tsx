import { Version } from '~/modules/types';
import { HistoryItem, HistoryPanel } from '../history';
import { A, pipe } from '@mobily/ts-belt';
import { EntityPageTypeChip } from './entity-page-type-chip';

interface Props {
  versions: Array<Version>;
  types: Array<string>;
}

export function EntityPageMetadataHeader({ versions, types }: Props) {
  // Parse all contributors to this page uniquely by their id. Try and
  // use their name, if they don't have one use their wallet address.
  const contributors = pipe(
    versions,
    A.uniqBy(v => v.createdBy.id),
    A.flatMap(version => version.createdBy)
  );

  // We restrict how many versions we render in the history panel. We don't
  // restrict on the subgraph since it would result in an inaccurate contributor
  // count since we would only have queried the most recent 10 versions.
  const mostRecentVersions = A.take(versions, 10);

  return (
    <div>
      {contributors.length > 0 && (
        <div className="flex items-center justify-between text-text">
          <ul className="flex items-center gap-1">
            {types.map(t => (
              <li key={t}>
                <EntityPageTypeChip typeName={t} />
              </li>
            ))}
          </ul>

          <HistoryPanel>
            {mostRecentVersions.map(version => (
              <HistoryItem key={version.id} version={version} />
            ))}
          </HistoryPanel>
        </div>
      )}
    </div>
  );
}
