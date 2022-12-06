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
        { field: 'linked-to', value: 'dffb5a2a-74b2-4c60-8e7c-7a37159d2807' },
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
      label: 'Is about caffeine',
      filterState: [
        {
          field: 'linked-to',
          value: '1393b29e-1261-4ee0-a79e-1f8ef9ed3e52',
        },
      ],
    },
  ],
  'San Francisco': [
    {
      label: 'Problems that lead to homelessness',
      filterState: [{ field: 'value', value: 'Problem' }],
    },
    {
      label: 'Homelessness issues relating to health',
      filterState: [
        { field: 'attribute-name', value: 'Related to' },
        { field: 'value', value: 'Health' },
      ],
    },
  ],
  'Root Space': [],
};
