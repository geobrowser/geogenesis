import { NodeViewContent } from '@tiptap/react';

// Widen NodeViewContent's `as` prop — v3 defaults to NoInfer<'div'> which blocks other tags
export const Content = NodeViewContent as React.FC<{ as?: string } & React.HTMLAttributes<HTMLElement>>;
