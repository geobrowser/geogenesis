'use client';

import styled from '@emotion/styled';
import { useEffect } from 'react';
import { Chip } from '~/modules/design-system/chip';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { usePageName } from '~/modules/state/use-page-name';
import { EntityNames, Triple } from '~/modules/types';

const MainAttributes = styled.div(props => ({
  marginBottom: props.theme.space * 8,
}));

const Attributes = styled.div(props => ({
  display: 'grid',
  gap: props.theme.space * 6,
}));

export function EntityPage({
  triples,
  id,
  name,
  space,
  entityNames,
}: {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
}) {
  const { setPageName } = usePageName();

  useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  return (
    <div>
      <MainAttributes>
        <Text as="p" variant="largeTitle">
          {name}
        </Text>
      </MainAttributes>

      <Attributes>
        {triples.map(triple => (
          <div key={triple.id}>
            <Text as="p" variant="metadata">
              {entityNames[triple.attributeId] || triple.attributeId}
            </Text>
            <Spacer height={8} />
            {triple.value.type === 'entity' ? (
              <Chip href={`/space/${space}/${triple.value.id}`}>{entityNames[triple.value.id] || triple.value.id}</Chip>
            ) : (
              <Text as="p" variant="metadataMedium">
                {triple.value.value}
              </Text>
            )}
          </div>
        ))}
      </Attributes>
    </div>
  );
}
