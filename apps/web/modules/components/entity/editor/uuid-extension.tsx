import { Extension } from '@tiptap/core';

export const UUIDExtension = Extension.create({
  addGlobalAttributes() {
    return [
      {
        // Extend the following extensions
        types: ['heading', 'paragraph', 'tableNode'],
        // … with those attributes
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
          },
        },
      },
    ];
  },
});
