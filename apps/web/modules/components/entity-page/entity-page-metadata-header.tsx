import BoringAvatar from 'boring-avatars';
import clsx from 'classnames';
import { Version } from '~/modules/types';
import { HistoryItem, HistoryPanel } from '../history';
import { AvatarGroup } from '~/modules/design-system/avatar-group';
import { A, pipe } from '@mobily/ts-belt';
import pluralize from 'pluralize';
import { GeoDate } from '~/modules/utils';
import Image from 'next/image';

interface Props {
  versions: Array<Version>;
}

export function EntityPageMetadataHeader({ versions }: Props) {
  // Parse all contributors to this page uniquely by their id. Try and
  // use their name, if they don't have one use their wallet address.
  const contributors = pipe(
    versions,
    A.uniqBy(v => v.createdBy.id),
    A.flatMap(version => version.createdBy)
  );

  // We only render the most recent three avatars in the avatar group and
  // render them in reverse order
  const lastThreeContributors = A.take(contributors, 3).reverse();
  const latestVersion = A.head(versions);

  // This will default to the beginning of UNIX time if there are no versions
  // We don't render the last edited date if there are no versions anyway.
  // e.g. Mar 12
  const lastEditedDate = GeoDate.fromGeoTime(latestVersion?.createdAt ?? 0).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  });

  // We restrict how many versions we render in the history panel
  const mostRecentVersions = A.take(versions, 10);

  return (
    <div>
      {contributors.length > 0 && (
        <div className="flex items-center justify-between text-text">
          <div className="flex items-center justify-between gap-2 text-breadcrumb text-text">
            <AvatarGroup>
              {lastThreeContributors.map((contributor, i) => (
                <AvatarGroup.Item>
                  {contributor.avatarUrl ? (
                    <Image
                      objectFit="cover"
                      layout="fill"
                      src={contributor.avatarUrl}
                      alt={`Avatar for ${contributor.name ?? contributor.id}`}
                    />
                  ) : (
                    <BoringAvatar size={12} square={true} variant="pixel" name={contributor.name ?? contributor.id} />
                  )}
                </AvatarGroup.Item>
              ))}
            </AvatarGroup>
            <p className="text-text">
              {contributors.length} {pluralize('Editor', contributors.length)}
            </p>
            {latestVersion && <p className="text-grey-04">Last edited {lastEditedDate}</p>}
          </div>

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
