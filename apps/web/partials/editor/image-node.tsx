import Image from '@tiptap/extension-image';
import { NodeViewRendererProps, ReactNodeViewRenderer } from '@tiptap/react';
import NextImage from 'next/legacy/image';
import Zoom from 'react-medium-image-zoom';

import { getImagePath } from '~/core/utils/utils';

export const ImageNode = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeComponent);
  },
});

function ImageNodeComponent({ node }: NodeViewRendererProps) {
  const { src } = node.attrs;

  return (
    <Zoom>
      <div className="min-h-[400px] w-full overflow-hidden rounded-lg">
        <NextImage layout="fill" objectFit="cover" src={getImagePath(src)} alt="" />
      </div>
    </Zoom>
  );
}
