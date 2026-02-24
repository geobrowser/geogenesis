export type Content =
  | {
      type: 'paragraph' | 'bulletList' | 'orderedList' | 'listItem' | 'tableNode';
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
      };
    }
  | {
      type: 'image';
      content: Content[];
      attrs: {
        id: string;
        src: string;
      };
    }
  | {
      type: 'video';
      content: Content[];
      attrs: {
        id: string;
        src: string;
      };
    }
  | {
      type: 'pdf';
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
