'use client';

import * as React from 'react';

import { useTriples } from '~/core/database/triples';
import { useEditEvents } from '~/core/events/edit-events';

export function Entity({ id }: { id: string }) {
  const send = useEditEvents(
    React.useMemo(() => {
      return {
        context: {
          entityId: id,
          entityName: '',
          spaceId: '5',
        },
      };
    }, [id])
  );

  const triples = useTriples(
    React.useMemo(() => {
      return {
        mergeWith: [],
        selector: t => {
          return t.entityId === id;
        },
      };
    }, [id])
  );

  console.log(`triples ${id}`, triples);

  return (
    <button
      onClick={() => {
        send({
          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          payload: {
            value: {
              type: 'TEXT',
              value: 'test-1',
            },
            renderable: {
              attributeId: 'test',
              attributeName: null,
              entityId: id,
              entityName: null,
              spaceId: '5',
              type: 'TEXT',
              value: 'test',
            },
          },
        });
      }}
    >
      {id}
    </button>
  );
}
