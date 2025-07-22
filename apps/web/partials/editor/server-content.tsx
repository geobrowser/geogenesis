import { Content } from '~/core/state/editor/types';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { TableBlockLoadingPlaceholder } from '../blocks/table/table-block';

type ServerContentProps = {
  content: Content[];
};

export const ServerContent = ({ content }: ServerContentProps) => {
  if (!content) {
    console.error('Content is undefined');
    return null;
  }

  return (
    <div className="tiptap ProseMirror !pb-[2rem]">
      {content.map((block, index) => (
        <Block key={index} block={block} />
      ))}
      <TrailingBreak />
    </div>
  );
};

type BlockProps = {
  block: Content;
};

const Block = ({ block }: BlockProps) => {
  /**
   * If a paragraph block is empty the editor might not store the content
   * array on the block. This can cause errors in here since we expect the
   * content array to exist. If the content does not exist we set it here
   * to an empty array.
   */
  if (!block.content) {
    block.content = [];
  }

  switch (block.type) {
    case 'paragraph': {
      return (
        <div className="react-renderer node-paragraph">
          <div className="whitespace-normal">
            <p>
              {block.content.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </p>
          </div>
        </div>
      );
    }

    case 'bulletList': {
      return (
        <ul>
          {block.content.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </ul>
      );
    }

    case 'orderedList': {
      return (
        <ol>
          {block.content.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </ol>
      );
    }

    case 'listItem': {
      return (
        <li>
          {block.content.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </li>
      );
    }

    case 'heading': {
      const Component = getHeading(block.attrs.level);

      return (
        <div className="react-renderer node-heading">
          <Component>
            {block.content.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </Component>
        </div>
      );
    }

    case 'text': {
      if (block?.marks?.[0]?.type === 'bold') {
        return <strong>{block.text}</strong>;
      }

      if (block?.marks?.[0]?.type === 'italic') {
        return <em>{block.text}</em>;
      }

      return <>{block.text}</>;
    }

    case 'image': {
      return <img src={block.attrs.src} alt="" />;
    }

    case 'tableNode': {
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
  }
};

const getHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) => {
  switch (level) {
    case 1:
      return 'h1';
    case 2:
      return 'h2';
    case 3:
      return 'h3';
    case 4:
      return 'h4';
    case 5:
      return 'h5';
    case 6:
      return 'h6';
    default:
      return 'p';
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
