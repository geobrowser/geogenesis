import Document from '@tiptap/extension-document';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Editor } from '@tiptap/react';

import { describe, expect, it } from 'vitest';

import type { Relation, Value } from '~/core/types';

import type { BlockClipboardPayload } from './block-clipboard';
import {
  blockClipboardHtml,
  blockPlainText,
  buildBlockLink,
  cloneBlockEntityData,
  cloneBlockNode,
  collectBlockEntityData,
  insertClonedBlock,
  parseBlockClipboardHtml,
  parseBlockClipboardPayload,
} from './block-clipboard';
import { createIdExtension } from './id-extension';

const sourceBlockId = 'source-block';
const sourceRelationEntityId = 'source-relation-entity';

function makeValue(entityId: string, propertyId: string, value: string): Value {
  return {
    id: `${entityId}:${propertyId}:source-space`,
    entity: { id: entityId, name: 'Old entity' },
    property: { id: propertyId, name: 'Property', dataType: 'TEXT' },
    value,
    spaceId: 'source-space',
    timestamp: 'old',
    isLocal: false,
    hasBeenPublished: true,
  };
}

function makeRelation(fromEntityId: string, toEntityId: string): Relation {
  return {
    id: `relation-${fromEntityId}-${toEntityId}`,
    entityId: `relation-entity-${fromEntityId}-${toEntityId}`,
    type: { id: 'property-id', name: 'Property' },
    fromEntity: { id: fromEntityId, name: 'Old from' },
    toEntity: { id: toEntityId, name: 'Old to', value: toEntityId },
    renderableType: 'RELATION',
    position: 'a0',
    verified: true,
    spaceId: 'source-space',
    timestamp: 'old',
    isLocal: false,
    hasBeenPublished: true,
  };
}

function payload(): BlockClipboardPayload {
  return {
    version: 1,
    node: {
      type: 'paragraph',
      attrs: { id: sourceBlockId, relationId: 'old-relation', spaceId: 'source-space' },
      content: [{ type: 'text', text: 'Hello 🌍' }],
    },
    plainText: 'Hello 🌍 <Geo>',
    sourceBlockId,
    sourceRelationEntityId,
    values: [
      makeValue(sourceBlockId, 'markdown-property', 'Hello 🌍'),
      makeValue(sourceRelationEntityId, 'view-property', 'TABLE'),
      makeValue('unrelated', 'ignored-property', 'ignore me'),
    ],
    relations: [
      makeRelation(sourceBlockId, 'shared-type'),
      makeRelation(sourceRelationEntityId, sourceBlockId),
      makeRelation('unrelated', 'ignored-target'),
    ],
  };
}

describe('Geo block clipboard', () => {
  it('round-trips structured data through HTML while retaining escaped fallback text', () => {
    const copied = payload();
    const html = blockClipboardHtml(copied);

    expect(html).toContain('Hello 🌍 &lt;Geo&gt;');
    expect(parseBlockClipboardHtml(html)).toEqual(copied);
  });

  it('rejects clipboard relations without the fields cloning dereferences', () => {
    const copied = payload();
    const malformed = { ...copied, relations: [{}] };

    expect(parseBlockClipboardPayload(JSON.stringify(malformed))).toBeNull();
  });

  it('rejects malformed nested editor nodes before insertion', () => {
    const copied = payload();
    const malformed = { ...copied, node: { ...copied.node, content: [{}] } };

    expect(parseBlockClipboardPayload(JSON.stringify(malformed))).toBeNull();
  });

  it('separates descendant list items in the plain-text fallback', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, BulletList, ListItem],
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
            ],
          },
        ],
      },
    });

    expect(blockPlainText(editor.state.doc.child(0))).toBe('one\ntwo');
    editor.destroy();
  });

  it('clones the editor node with destination IDs and space', () => {
    const cloned = cloneBlockNode(payload(), 'destination-space', 'new-block');

    expect(cloned.blockId).toBe('new-block');
    expect(cloned.node.attrs).toMatchObject({
      id: 'new-block',
      relationId: null,
      spaceId: 'destination-space',
    });
    expect(cloned.node.content).toEqual([{ type: 'text', text: 'Hello 🌍' }]);
  });

  it('inserts a duplicate at an exact top-level position', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, createIdExtension('destination-space')],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: 'first' }, content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', attrs: { id: 'second' }, content: [{ type: 'text', text: 'Second' }] },
        ],
      },
    });
    document.body.appendChild(editor.view.dom);
    const positionAfterFirstBlock = editor.state.doc.child(0).nodeSize;

    expect(
      insertClonedBlock(editor, payload(), 'destination-space', {
        blockId: 'new-block',
        position: positionAfterFirstBlock,
      })
    ).toBe('new-block');
    expect(
      Array.from({ length: editor.state.doc.childCount }, (_, index) => editor.state.doc.child(index).textContent)
    ).toEqual(['First', 'Hello 🌍', 'Second']);
    expect(editor.state.doc.child(1).attrs).toMatchObject({ id: 'new-block', spaceId: 'destination-space' });

    editor.view.dom.remove();
    editor.destroy();
  });

  it('pastes after the containing top-level list instead of nesting at the cursor', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, BulletList, ListItem, createIdExtension('destination-space')],
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            attrs: { id: 'existing-list' },
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing item' }] }],
              },
            ],
          },
        ],
      },
    });
    document.body.appendChild(editor.view.dom);
    editor.commands.setTextSelection(3);

    expect(insertClonedBlock(editor, payload(), 'destination-space', { blockId: 'new-block' })).toBe('new-block');
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('bulletList');
    expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).textContent).toBe('Hello 🌍');

    editor.view.dom.remove();
    editor.destroy();
  });

  it('remaps copied block entities while preserving shared relation targets', () => {
    let nextId = 0;
    const cloned = cloneBlockEntityData({
      payload: payload(),
      blockId: 'new-block',
      relationEntityId: 'new-relation-entity',
      spaceId: 'destination-space',
      createEntityId: () => `new-id-${++nextId}`,
    });

    expect(cloned.values).toHaveLength(2);
    expect(cloned.values.map(value => value.entity.id)).toEqual(['new-block', 'new-relation-entity']);
    expect(cloned.values.every(value => value.spaceId === 'destination-space')).toBe(true);
    expect(cloned.values.every(value => value.timestamp === undefined && value.hasBeenPublished === undefined)).toBe(
      true
    );

    expect(cloned.relations).toHaveLength(2);
    expect(cloned.relations[0]).toMatchObject({
      id: 'new-id-3',
      entityId: 'new-id-1',
      fromEntity: { id: 'new-block', name: null },
      toEntity: { id: 'shared-type', name: 'Old to', value: 'shared-type' },
      spaceId: 'destination-space',
    });
    expect(cloned.relations[1]).toMatchObject({
      id: 'new-id-4',
      entityId: 'new-id-2',
      fromEntity: { id: 'new-relation-entity', name: null },
      toEntity: { id: 'new-block', name: null, value: 'new-block' },
      spaceId: 'destination-space',
    });
  });

  it('collects values on owned relation entities without copying shared targets', () => {
    const shownColumn = makeRelation(sourceRelationEntityId, 'shared-property');
    const relationEntityType = makeRelation(shownColumn.entityId, 'shared-relation-type');
    const collected = collectBlockEntityData({
      rootEntityIds: [sourceRelationEntityId],
      values: [
        makeValue(sourceRelationEntityId, 'view', 'TABLE'),
        makeValue(shownColumn.entityId, 'selector', 'name'),
        makeValue('shared-property', 'name', 'Shared property'),
      ],
      relations: [shownColumn, relationEntityType, makeRelation('shared-property', 'unrelated')],
    });

    expect(collected.relations).toEqual([shownColumn, relationEntityType]);
    expect(collected.values.map(value => value.entity.id)).toEqual([sourceRelationEntityId, shownColumn.entityId]);
  });

  it('builds a block link without dropping existing page and tab parameters', () => {
    expect(buildBlockLink('https://geobrowser.com/space/space-id/entity-id?tabId=tab-id', 'block-id')).toBe(
      'https://geobrowser.com/space/space-id/entity-id?tabId=tab-id&source=copy_link#block-id'
    );
  });
});
