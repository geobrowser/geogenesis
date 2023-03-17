import { Version } from '~/modules/types';
import { HistoryItem } from '../history';
import { HistoryPanel } from '../history/history-panel';
import { AvatarGroup } from '~/modules/design-system/avatar-group';
import { A, pipe } from '@mobily/ts-belt';
import pluralize from 'pluralize';
import { EntityPageTypeChip } from './entity-page-type-chip';
import { GeoDate } from '~/modules/utils';

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
    A.flatMap(version => version.createdBy.name ?? version.createdBy.id)
  );

  // We only render the first three avatars in the avatar group
  const firstThreeContributors = A.take(contributors, 3);
  const latestVersion = A.head(versions);
  const lastEditedDate = GeoDate.fromGeoTime(latestVersion?.createdAt ?? 0);

  return (
    <div>
      {contributors.length > 0 && (
        <div className="mb-2 flex items-center justify-between text-text">
          <div className="flex items-center justify-between gap-2 text-breadcrumb text-text">
            <AvatarGroup usernames={firstThreeContributors} />
            <p className="text-text">
              {contributors.length} {pluralize('Editor', contributors.length)}
            </p>
            {latestVersion && (
              <p className="text-grey-04">
                Last edited{' '}
                {lastEditedDate.toLocaleDateString(undefined, {
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
            )}
          </div>

          <HistoryPanel>
            {versions.map(version => (
              <HistoryItem key={version.id} version={version} />
            ))}
          </HistoryPanel>
        </div>
      )}

      <ul className="flex items-center gap-1">
        {types.map(t => (
          <li key={t}>
            <EntityPageTypeChip typeName={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}
