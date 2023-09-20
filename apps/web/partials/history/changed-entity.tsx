import { AttributeId, BlockId, Changeset } from '~/core/utils/change/change';

import { ChangedAttribute } from './changed-attribute';
import { ChangedBlock } from './changed-block';
import { EntityId, SpaceId } from './types';

type ChangedEntityProps = {
  spaceId?: SpaceId;
  change: Changeset;
  entityId: EntityId;
};

export const ChangedEntity = ({ change, entityId }: ChangedEntityProps) => {
  const { name, blocks = {}, attributes = {} } = change;

  const blockIds = Object.keys(blocks);
  const attributeIds = Object.keys(attributes);

  let renderedName = name;

  if (!renderedName) {
    attributeIds.forEach(attributeId => {
      const attribute = attributes[attributeId];

      if (attribute.name === 'Name' && typeof attribute.after === 'string') {
        renderedName = attribute.after;
      }
    });
  }

  return (
    <div className="relative -top-12 pt-12">
      <div className="flex flex-col gap-5">
        <h3 className="text-mediumTitle">{renderedName}</h3>
        <div className="flex gap-8">
          <div className="flex-1 text-body">Previous version</div>
          <div className="relative flex-1 text-body">This version</div>
        </div>
      </div>
      {blockIds.length > 0 && (
        <div className="mt-4">
          {blockIds.map((blockId: BlockId) => (
            <ChangedBlock key={blockId} blockId={blockId} block={blocks[blockId]} />
          ))}
        </div>
      )}
      {attributeIds.length > 0 && (
        <div className="mt-2">
          {attributeIds.map((attributeId: AttributeId) => (
            <ChangedAttribute
              key={attributeId}
              attributeId={attributeId}
              attribute={attributes[attributeId]}
              entityId={entityId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
