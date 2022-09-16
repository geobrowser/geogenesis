import { Facts, MockApi, useSharedObservable } from '@geogenesis/sync-store';

export type Fact = {
  id: string;
  entityId: string;
  attribute: string;
  value: string | number;
};

export const data: Fact[] = Array.from({ length: 3 }, (_, index) => {
  return {
    id: index.toString(),
    entityId: index.toString(),
    attribute: 'name',
    value: 'John Doe' + ' ' + index,
  };
});

const FactsStore = new Facts({ api: new MockApi(), initialFacts: data });

// TODO: Inject FactsStore via context
export const useFacts = () => {
  const snapshot = useSharedObservable(FactsStore.facts$);
  const createFact = (fact: Fact) => FactsStore.createFact(fact);
  return { facts: snapshot, createFact };
};
