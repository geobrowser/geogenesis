import { ContentIds, SystemIds } from '@graphprotocol/grc-20';
import * as React from 'react';

import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useQueryEntity } from '~/core/sync/use-store';
import { Relation, RelationRenderableProperty, Triple, TripleRenderableProperty } from '~/core/types';
import { GeoNumber, NavUtils, getImagePath } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

interface Props {
  triples: Triple[];
  relations: Relation[];
  id: string;
  spaceId: string;
}

export function ReadableEntityPage({ triples: serverTriples, id, spaceId }: Props) {
  const entityId = id;

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId: renderables } = useRenderables(serverTriples, spaceId, isRelationPage);

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {Object.entries(renderables).map(([attributeId, renderable]) => {
        const isRelation = renderable[0].type === 'RELATION' || renderable[0].type === 'IMAGE';

        if (isRelation) {
          return <RelationsGroup key={attributeId} relations={renderable as RelationRenderableProperty[]} />;
        }

        return (
          <TriplesGroup
            key={attributeId}
            entityId={entityId}
            triples={renderable as TripleRenderableProperty[]}
            spaceId={spaceId}
          />
        );
      })}
    </div>
  );
}

const ReadableNumberField = ({ value, format, unitId }: { value: string; format?: string; unitId?: string }) => {
  const { entity } = useQueryEntity({ id: unitId });

  const currencySign = React.useMemo(
    () => entity?.triples.find(t => t.attributeId === SystemIds.CURRENCY_SIGN_ATTRIBUTE)?.value?.value,
    [entity]
  );

  return <Text as="p">{GeoNumber.format(value, format, currencySign)}</Text>;
};

function TriplesGroup({
  entityId,
  triples,
  spaceId,
}: {
  entityId: string;
  triples: TripleRenderableProperty[];
  spaceId: string;
}) {
  return (
    <>
      {triples.map((t, index) => {
        // hide name property, it is already rendered in the header
        if (t.attributeId === SystemIds.NAME_PROPERTY) {
          return null;
        }
        return (
          <div key={`${entityId}-${t.attributeId}-${index}`} className="break-words">
            <Text as="p" variant="bodySemibold">
              {triples[0].attributeName || t.attributeId}
            </Text>
            <div className="flex flex-wrap gap-2">
              {triples.map(renderable => {
                switch (renderable.type) {
                  case 'TEXT': {
                    return (
                      <Text key={`string-${renderable.attributeId}-${renderable.value}`} as="p">
                        {renderable.value}
                      </Text>
                    );
                  }
                  case 'NUMBER':
                    return (
                      <ReadableNumberField
                        value={renderable.value}
                        format={renderable.options?.format}
                        unitId={renderable.options?.unit}
                      />
                    );
                  case 'CHECKBOX': {
                    const checked = getChecked(renderable.value);

                    return (
                      <Checkbox key={`checkbox-${renderable.attributeId}-${renderable.value}`} checked={checked} />
                    );
                  }
                  case 'TIME': {
                    return (
                      <DateField
                        key={`time-${renderable.attributeId}-${renderable.value}`}
                        isEditing={false}
                        value={renderable.value}
                        format={renderable.options?.format}
                      />
                    );
                  }
                  case 'URL': {
                    return (
                      <WebUrlField
                        key={`uri-${renderable.attributeId}-${renderable.value}`}
                        isEditing={false}
                        spaceId={spaceId}
                        value={renderable.value}
                      />
                    );
                  }
                }
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function RelationsGroup({ relations, isTypes }: { relations: RelationRenderableProperty[], isTypes?: boolean }) {
  const attributeId = relations[0].attributeId;
  const attributeName = relations[0].attributeName;
  const spaceId = relations[0].spaceId;

  // hide cover, avatar, and type properties
  // they are already rendered in the avatar cover component
  // unless this is the types group that is rendered in the header
  if (
    (attributeId === SystemIds.COVER_PROPERTY) ||
    (attributeId === ContentIds.AVATAR_PROPERTY) || 
    (attributeId === SystemIds.TYPES_PROPERTY && !isTypes)
  ) {
    return null;
  }

  return (
    <>
      <div key={`${attributeId}-${attributeName}`} className="break-words">
        {attributeId !== SystemIds.TYPES_PROPERTY && (
          <Link href={NavUtils.toEntity(spaceId, attributeId)}>
            <Text as="p" variant="bodySemibold">
              {attributeName ?? attributeId}
            </Text>
          </Link>
        )}
        
        <div className="flex flex-wrap gap-2">
          {relations.map(r => {
            const relationId = r.relationId;
            const relationName = r.valueName;
            const renderableType = r.type;
            const relationValue = r.value;

            if (renderableType === 'IMAGE') {
              const imagePath = getImagePath(relationValue ?? '');
              return <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={imagePath} />;
            }
            
            return (
              <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
                <LinkableRelationChip
                  isEditing={false}
                  entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                  relationHref={NavUtils.toEntity(spaceId, relationId)}
                >
                  {relationName ?? relationValue}
                </LinkableRelationChip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
