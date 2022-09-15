import { useState } from 'react';

export type Fact = {
  id: string;
  entityId: string;
  attribute: string;
  value: string | number;
};

export const data: Fact[] = Array.from({ length: 25 }, (_, index) => {
  return {
    id: index.toString(),
    entityId: index.toString(),
    attribute: 'name',
    value: 'John Doe' + ' ' + index,
  };
});

export function useFacts() {
  const [facts, setFacts] = useState(data);

  const addFact = () => {
    setFacts([
      {
        id: Math.random().toString(),
        entityId: 'askldjasd',
        attribute: '',
        value: '',
      },
      ...facts,
    ]);
  };

  return { facts, addFact };
}
