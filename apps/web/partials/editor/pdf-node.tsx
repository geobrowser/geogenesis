import { Node, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import dynamic from 'next/dynamic';

import { useHydrateEntity } from '~/core/sync/use-store';

const PdfZoom = dynamic(() => import('../../design-system/editable-fields/pdf-preview'), {
  ssr: false,
});

export const PdfNode = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  spanning: false,
  allowGapCursor: false,
  defining: true,
  exitable: true,

  addAttributes() {
    return {
      src: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'pdf-node' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pdf-node', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfNodeComponent);
  },
});

function PdfNodeComponent({ node }: NodeViewProps) {
  const { id, src } = node.attrs;

  return (
    <NodeViewWrapper>
      <div contentEditable="false" suppressContentEditableWarning className="pdf-node my-4">
        <PdfNodeChildren pdfSrc={src} entityId={id} />
      </div>
    </NodeViewWrapper>
  );
}

function PdfNodeChildren({ pdfSrc, entityId }: { pdfSrc: string; entityId: string }) {
  useHydrateEntity({ id: entityId });

  return (
    <div className="h-full w-full">
      <PdfZoom pdfSrc={pdfSrc} isEditing={false} className="h-full w-[400px] overflow-hidden rounded-sm" width={399} />
    </div>
  );
}
