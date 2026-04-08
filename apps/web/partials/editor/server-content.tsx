import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { TableBlockLoadingPlaceholder } from '../blocks/table/table-block';

export type ServerBlock =
  | { type: 'text'; markdown: string }
  | { type: 'image'; src: string }
  | { type: 'video'; src: string }
  | { type: 'data' };

type ServerContentProps = {
  blocks: ServerBlock[];
};

export const ServerContent = ({ blocks }: ServerContentProps) => {
  if (!blocks) {
    console.error('Blocks is undefined');
    return null;
  }

  return (
    <div className="tiptap ProseMirror pb-8!">
      {blocks.map((block, index) => (
        <ServerBlockRenderer key={index} block={block} />
      ))}
      <TrailingBreak />
    </div>
  );
};

const ServerBlockRenderer = ({ block }: { block: ServerBlock }) => {
  switch (block.type) {
    case 'text': {
      if (!block.markdown.trim()) {
        return (
          <div className="react-renderer node-paragraph">
            <div className="whitespace-normal">
              <p>
                <br className="ProseMirror-trailingBreak" />
              </p>
            </div>
          </div>
        );
      }
      return <>{renderMarkdownDocument(block.markdown)}</>;
    }

    case 'image':
      return <img src={block.src} alt="" />;

    case 'video':
      return (
        <video src={block.src} controls className="h-auto w-full rounded-lg">
          Your browser does not support the video tag.
        </video>
      );

    case 'data':
      return (
        <>
          <Spacer height={24} />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-16" />
            </div>
            <TableBlockLoadingPlaceholder />
          </div>
        </>
      );
  }
};

const TrailingBreak = () => {
  return (
    <div className="react-renderer node-paragraph">
      <div className="whitespace-normal">
        <p className="whitespace-pre">
          <br className="ProseMirror-trailingBreak" />
        </p>
      </div>
    </div>
  );
};
