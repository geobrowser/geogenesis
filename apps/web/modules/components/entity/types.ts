import { Triple } from '~/modules/types';

export type LinkedEntityGroup = {
  triples: Triple[];
  name: string | null;
  id: string;
};
