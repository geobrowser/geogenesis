import { SYSTEM_IDS } from '@geogenesis/ids';
import { generateJSON } from '@tiptap/core';
import showdown from 'showdown';

import { tiptapExtensions } from '~/partials/editor/editor';

import { entityTriplesSelector, spaceTriplesSelector } from '../state/utils';
import { Triple as ITriple } from '../types';
import { Triple } from '../utils/triple';
import { getImagePath } from '../utils/utils';
import { Value } from '../utils/value';
import { useGeoSelector } from './use-selector';

const markdownConverter = new showdown.Converter();

interface Props {
  spaceId: string;
  entityId: string;
  initialBlockIdsTriple: ITriple | null;
  initialBlockTriples: ITriple[];
}

export function useEditor({ spaceId, entityId, initialBlockIdsTriple, initialBlockTriples }: Props) {
  const localTriplesForEntity = useGeoSelector(state => entityTriplesSelector(state, entityId));
  const localTriplesForSpace = useGeoSelector(state => spaceTriplesSelector(state, spaceId));

  const localBlockIdsTriple: ITriple | undefined = localTriplesForEntity.find(t => t.attributeId === SYSTEM_IDS.BLOCKS);

  // Favor the local version of the blockIdsTriple if it exists
  const blockIdsTriple = localBlockIdsTriple ?? initialBlockIdsTriple ?? null;
  const blockIds = blockIdsTriple ? (JSON.parse(Value.stringValue(blockIdsTriple) || '[]') as string[]) : [];
  const blockTriplesForEntity = Triple.merge(localTriplesForSpace, initialBlockTriples).filter(t =>
    blockIds.includes(t.entityId)
  );

  const json = {
    type: 'doc',
    content: blockIds.map(blockId => {
      const markdownTriple = blockTriplesForEntity.find(
        triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT
      );
      const rowTypeTriple = blockTriplesForEntity.find(
        triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.ROW_TYPE
      );
      const imageTriple = blockTriplesForEntity.find(
        triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.IMAGE_ATTRIBUTE
      );

      if (imageTriple) {
        return {
          type: 'image',
          attrs: {
            spaceId: spaceId,
            id: blockId,
            src: getImagePath(Triple.getValue(imageTriple) ?? ''),
            alt: '',
            title: '',
          },
        };
      }

      if (rowTypeTriple) {
        return {
          type: 'tableNode',
          attrs: {
            spaceId: spaceId,
            id: blockId,
            typeId: rowTypeTriple.value.id,
            typeName: Value.nameOfEntityValue(rowTypeTriple),
          },
        };
      }

      const html = markdownTriple ? markdownConverter.makeHtml(Value.stringValue(markdownTriple) || '') : '';
      /* SSR on custom react nodes doesn't seem to work out of the box at the moment */
      const isSSR = typeof window === 'undefined';
      const json = isSSR ? { content: '' } : generateJSON(html, tiptapExtensions);
      const nodeData = json.content[0];

      return {
        ...nodeData,
        attrs: {
          ...nodeData?.attrs,
          id: blockId,
        },
      };
    }),
  };

  if (json.content.length === 0) {
    json.content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '',
        },
      ],
    });
  }

  console.log('editorJson', json)
  const editorJson = json;
}
