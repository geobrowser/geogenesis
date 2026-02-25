'use client';

import { JSONContent, generateHTML } from '@tiptap/react';

import * as React from 'react';

import { tiptapExtensions } from '~/partials/editor/extensions';

type Status = 'pending' | 'pass' | 'fail';

const LEAF_NODE_FIXTURES: JSONContent[] = [
  {
    type: 'image',
    attrs: {
      src: 'ipfs://example-image',
    },
  },
  {
    type: 'video',
    attrs: {
      src: 'ipfs://example-video',
    },
  },
  {
    type: 'tableNode',
    attrs: {},
  },
];

function serializeLeafNodeFixtures() {
  for (const node of LEAF_NODE_FIXTURES) {
    generateHTML(
      {
        type: 'doc',
        content: [node],
      },
      tiptapExtensions
    );
  }
}

export default function TiptapLeafSerializerPage() {
  const [status, setStatus] = React.useState<Status>('pending');
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    try {
      serializeLeafNodeFixtures();
      setStatus('pass');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown serialization error';

      setStatus('fail');
      setErrorMessage(message);
      console.error('Leaf node serialization failed:', error);
    }
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-8" data-testid="leaf-serializer-page">
      <h1 className="mb-4 text-2xl">TipTap leaf serializer smoke test</h1>
      <p className="mb-4 text-grey-04">
        Verifies custom leaf nodes serialize without triggering &quot;Content hole not allowed in a leaf node spec&quot;.
      </p>

      <div className="rounded border border-grey-02 bg-grey-01 p-4">
        <div className="font-mono text-xs text-grey-04">status</div>
        <div data-testid="leaf-serializer-status" className="font-mono text-sm">
          {status}
        </div>
      </div>

      {errorMessage && (
        <pre data-testid="leaf-serializer-error" className="mt-4 overflow-x-auto rounded bg-red-100 p-4 text-sm text-red-900">
          {errorMessage}
        </pre>
      )}
    </main>
  );
}
