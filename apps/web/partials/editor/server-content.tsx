type ServerContentProps = {
  content: Content[];
};

export const ServerContent = ({ content }: ServerContentProps) => {
  return (
    <div className="tiptap ProseMirror !pb-[2rem]">
      {content.map((block, index) => (
        <Block key={index} block={block} />
      ))}
      <TrailingBreak />
    </div>
  );
};

type Content =
  | {
      type: 'paragraph' | 'bulletList' | 'orderedList' | 'listItem';
      content: Content[];
      attrs: {
        id: string;
      };
    }
  | {
      type: 'heading';
      content: Content[];
      attrs: {
        id: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
      };
    }
  | {
      type: 'text';
      text: string;
      content: Content[];
      marks: Mark[];
      attrs: {
        id: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
      };
    }
  | {
      type: 'image';
      content: Content[];
      attrs: {
        id: string;
        src: string;
      };
    };

type Mark = {
  type: 'bold' | 'italic';
  text: string;
};

type BlockProps = {
  block: Content;
};

const Block = ({ block }: BlockProps) => {
  switch (block.type) {
    case 'paragraph': {
      return (
        <div className="react-renderer node-paragraph">
          <div className="whitespace-normal">
            <p>
              {block.content.map((block: any, index: number) => (
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
          {block.content.map((block: any, index: number) => (
            <Block key={index} block={block} />
          ))}
        </ul>
      );
    }

    case 'orderedList': {
      return (
        <ol>
          {block.content.map((block: any, index: number) => (
            <Block key={index} block={block} />
          ))}
        </ol>
      );
    }

    case 'listItem': {
      return (
        <li>
          {block.content.map((block: any, index: number) => (
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
            {block.content.map((block: any, index: number) => (
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
  }
};

const TrailingBreak = () => {
  return (
    <div className="react-renderer node-paragraph">
      <div className="whitespace-normal">
        <p className="whitespace-pre">
          <div>
            <br className="ProseMirror-trailingBreak" />
          </div>
        </p>
      </div>
    </div>
  );
};
