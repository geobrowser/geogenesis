import { v4 } from 'uuid';

export function createGeoId() {
  return v4();
}

type CreateTripleIdArgs = {
  spaceId: string;
  entityId: string;
  attributeId: string;
};

export function createTripleId(args: CreateTripleIdArgs): string {
  return `${args.spaceId}:${args.entityId}:${args.attributeId}`;
}
