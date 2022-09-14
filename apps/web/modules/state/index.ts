import { useState } from 'react';

export type Fact = {
  id: string;
  entityId: string;
  attribute: string;
  value: string | number;
};

export const data: Fact[] = [
  {
    id: '1',
    entityId: 'askldjasd',
    attribute: 'Died in',
    value: 0,
  },
  {
    id: '2',
    entityId: 'askldjasd',
    attribute: 'name',
    value: 'Jesus Christ',
  },
];

export function useFacts() {
  const [facts, setFacts] = useState(data);

  const addFact = () => {
    setFacts([
      {
        id: '3',
        entityId: 'askldjasd',
        attribute: '',
        value: '',
      },
      ...facts,
    ]);
  };

  return { facts, addFact };
}
