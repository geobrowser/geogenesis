export type ReferencedByEntity = {
  id: string;
  name: string | null;
  types: { id: string; name: string | null }[];
  spaceId: string;
};
