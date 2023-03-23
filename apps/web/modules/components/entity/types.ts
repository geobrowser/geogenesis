export type ReferencedByEntity = {
  id: string;
  name: string | null;
  types: { id: string; name: string | null }[];
  space: {
    id: string;
    name: string | null;
    image: string | null;
  };
};
