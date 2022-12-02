import { FilterState } from '~/modules/types';

type PredefinedQuery = {
  label: string;
  filterState: FilterState;
}[];

export const PREDEFINED_QUERIES: Record<string, PredefinedQuery> = {
  Health: [
    {
      label: 'Supplements for COVID',
      filterState: [
        { field: 'entity-name', value: 'COVID' },
        { field: 'attribute-name', value: 'Is about' },
        { field: 'value', value: 'Supplements' },
      ],
    },
    {
      label: 'Author is Rhonda Patrick',
      filterState: [
        { field: 'attribute-name', value: 'Author' },
        { field: 'value', value: 'Rhonda Patrick' },
      ],
    },
    {
      label: 'Heat exposure benefits',
      filterState: [{ field: 'value', value: 'Heat exposure benefits' }],
    },
    {
      label: 'Sleep tips',
      filterState: [{ field: 'value', value: 'Sleep tips' }],
    },
    {
      label: 'Exercise tips',
      filterState: [{ field: 'value', value: 'Exercise tips' }],
    },
    {
      label: 'Stress tips',
      filterState: [{ field: 'value', value: 'Stress tips' }],
    },
    {
      label: 'Claims by Andrew Huberman',
      filterState: [
        { field: 'linked-to', value: 'ddb0fea6-d494-4b0b-8f3e-32307f8fe45d' },
        { field: 'attribute-name', value: 'Author' },
      ],
    },
    {
      label: 'Contributions to media by Matthew LaPlante',
      filterState: [
        { field: 'attribute-name', value: 'Contributed by' },
        {
          field: 'value',
          value: 'Matthew LaPlante',
        },
      ],
    },
    {
      label: 'How we see and process color',
      filterState: [
        {
          field: 'linked-to',
          value: '01d0c9ad-cee3-4044-9f75-7285e9873d30',
        },
      ],
    },
  ],
  'San Francisco': [],
  'Root Space': [],
};
