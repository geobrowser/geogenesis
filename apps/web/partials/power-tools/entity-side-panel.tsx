'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { Close } from '~/design-system/icons/close';
import { useQueryEntity } from '~/core/sync/use-store';
import { Text } from '~/design-system/text';
import { NavUtils } from '~/core/utils/utils';
import { NewTab } from '~/design-system/icons/new-tab';
import { Edit } from '~/design-system/icons/edit';
import { ReadableEntityPage } from '../entity-page/readable-entity-page';
import { EditableEntityPage } from '../entity-page/editable-entity-page';
import { useRenderedProperties } from '~/core/hooks/use-renderables';
import { EntityPanelContent } from './entity-panel-content';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { EntityPageContentContainer } from '../entity-page/entity-page-content-container';
import { useRelations, useValues, useQueryProperty, useValue } from '~/core/sync/use-store';
import { useProperties } from '~/core/hooks/use-properties';
import { SystemIds } from '@graphprotocol/grc-20';
import { RelationsGroup } from '../entity-page/readable-entity-page';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';

// Cross-space version of useRenderedProperties that shows all entity data regardless of space
function useCrossSpaceRenderedProperties(entityId: string) {
  const values = useValues({
    selector: v => v.entity.id === entityId && !v.isDeleted,
  });

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && !r.isDeleted,
  });

  const SKIPPED_PROPERTIES: string[] = [SystemIds.BLOCKS];

  const uniqueProperties = new Set(
    [...values.map(v => v.property.id), ...relations.map(r => r.type.id)].filter(p => !SKIPPED_PROPERTIES.includes(p))
  );

  return useProperties([...uniqueProperties.values()]) ?? {};
}

// Cross-space version of ValuesGroup that shows values regardless of space
function CrossSpaceValuesGroup({ entityId, spaceId, propertyId }: { entityId: string; spaceId: string; propertyId: string }) {
  const { property } = useQueryProperty({ id: propertyId });

  // Get ALL values for this entity and property (cross-space)
  const values = useValues({
    selector: v => v.entity.id === entityId && v.property.id === propertyId && !v.isDeleted,
  });

  if (!property) {
    return null;
  }

  return (
    <>
      {values.map((t, index) => {
        // hide name property, it is already rendered in the header
        if (propertyId === SystemIds.NAME_PROPERTY) {
          return null;
        }
        return (
          <div key={`${entityId}-${propertyId}-${index}`} className="break-words">
            <Link href={NavUtils.toEntity(spaceId, propertyId)}>
              <Text as="p" variant="bodySemibold">
                {property.name || propertyId}
              </Text>
            </Link>
            <div className="flex flex-wrap gap-2">
              <Text as="p">{t.value || '—'}</Text>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Cross-space version of ReadableEntityPage that shows all data regardless of space
function CrossSpaceReadableEntityPage({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const renderedProperties = useCrossSpaceRenderedProperties(entityId);

  // If no properties at all, show a message
  if (Object.keys(renderedProperties).length === 0) {
    return (
      <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
        <Text variant="body" color="grey-04">
          No properties found for this entity.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {Object.entries(renderedProperties).map(([propertyId, property]) => {
        const isRelation = property.dataType === 'RELATION';

        if (isRelation) {
          return <RelationsGroup key={propertyId} entityId={entityId} spaceId={spaceId} propertyId={propertyId} />;
        }

        return <CrossSpaceValuesGroup key={propertyId} entityId={entityId} propertyId={propertyId} spaceId={spaceId} />;
      })}
    </div>
  );
}

// Wrapper component to provide proper context and layout for entity pages
function EntityPageWrapper({
  entityId,
  spaceId,
  isEditing,
  entity
}: {
  entityId: string;
  spaceId: string;
  isEditing: boolean;
  entity: any;
}) {
  return (
    <EntityStoreProvider id={entityId} spaceId={spaceId}>
      <EntityPageContentContainer>
        {isEditing ? (
          <EditableEntityPage id={entityId} spaceId={spaceId} />
        ) : (
          <CrossSpaceReadableEntityPage entityId={entityId} spaceId={spaceId} />
        )}
      </EntityPageContentContainer>
    </EntityStoreProvider>
  );
}

interface Props {
  entityId: string;
  spaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EntitySidePanel({ entityId, spaceId, isOpen, onClose }: Props) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const [isEditing, setIsEditing] = React.useState(false);
  const canUserEdit = useCanUserEdit(spaceId);

  console.log('EntitySidePanel render:', { entityId, spaceId, isOpen, entity, isLoading, isEditing, canUserEdit });

  // Reset edit mode if user loses permission
  React.useEffect(() => {
    if (!canUserEdit && isEditing) {
      setIsEditing(false);
    }
  }, [canUserEdit, isEditing]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black bg-opacity-20" />
        <Dialog.Content className="fixed right-0 top-0 z-[101] h-full w-1/2 min-w-[400px] max-w-[600px] bg-white shadow-xl focus:outline-none">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-grey-02 p-4">
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                <Text variant="mediumTitle" className="truncate">
                  {entity?.name || 'Untitled'}
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => canUserEdit && setIsEditing(!isEditing)}
                  disabled={!canUserEdit}
                  className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium shadow-button transition-colors ${
                    canUserEdit
                      ? 'border-grey-02 bg-white text-text hover:border-text hover:bg-bg'
                      : 'border-grey-02 bg-grey-01 text-grey-03 cursor-not-allowed'
                  }`}
                  title={
                    !canUserEdit
                      ? "You don't have permission to edit in this space"
                      : isEditing
                      ? "Switch to read mode"
                      : "Switch to edit mode"
                  }
                >
                  <Edit />
                  <span>{isEditing ? 'Read' : 'Edit'}</span>
                </button>
                <a
                  href={NavUtils.toEntity(spaceId, entityId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-grey-02 bg-white px-3 py-1.5 text-sm font-medium text-text shadow-button transition-colors hover:border-text hover:bg-bg"
                  title="Open entity page"
                >
                  <span>Open Entity Page</span>
                  <NewTab />
                </a>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
                  aria-label="Close panel"
                >
                  <Close />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Text variant="body" color="grey-04">
                    Loading...
                  </Text>
                </div>
              ) : entity ? (
                <EntityPageWrapper
                  entityId={entityId}
                  spaceId={spaceId}
                  isEditing={isEditing}
                  entity={entity}
                />
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Text variant="body" color="grey-04">
                    Entity not found
                  </Text>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}