import { SpaceId } from '~/core/io/schema';

export type Content =
  | {
      type: 'paragraph' | 'bulletList' | 'orderedList' | 'listItem' | 'tableNode';
      content: Content[];
      attrs: {
        id: string;
      };
    }
  | {
      type: 'heading';
      content: Content[];
      attrs: {
        id: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
      };
    }
  | {
      type: 'text';
      text: string;
      content: Content[];
      marks: Mark[];
      attrs: {
        id: string;
      };
    }
  | {
      type: 'image';
      content: Content[];
      attrs: {
        id: string;
        src: string;
      };
    };

type Mark = {
  type: 'bold' | 'italic';
  text: string;
};

export type CollectionSource = {
  type: 'COLLECTION';
  value: string;
};

export type MultipleSources = {
  type: 'SPACES'; // | 'collections';
  value: Array<SpaceId>;
};

export type AllOfGeoSource = {
  type: 'GEO'; // we don't care about the value since we aren't querying based on a specific space or collection
};

export type Source = CollectionSource | MultipleSources | AllOfGeoSource;
