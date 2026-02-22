import { Entity } from '~/core/types';

import { RemoteEntity } from '../schema';
import { SubstreamVersion } from '../substream-schema';
import { EntityDtoLive } from './entities';

export type Version = Entity & {
  versionId: string;
};

export function VersionDto(version: SubstreamVersion): Version {
  return {
    // @TODO(migration): Fix types
    ...EntityDtoLive(version as unknown as RemoteEntity),
    versionId: version.id,
  };
}
