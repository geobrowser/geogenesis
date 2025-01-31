import Image from '@tiptap/extension-image';
import { NodeViewRendererProps, ReactNodeViewRenderer } from '@tiptap/react';

import { PageImageField } from '~/design-system/editable-fields/editable-fields';

export const ImageNode = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeComponent);
  },
});

function ImageNodeComponent({ node }: NodeViewRendererProps) {
  const { src } = node.attrs;

  return <PageImageField imageSrc={src} onImageChange={() => {}} onImageRemove={() => {}} />;
}
