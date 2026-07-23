import { NextResponse } from 'next/server';

import { DebateNotPublishableError } from '~/core/debates/server/debate-source';
import { publishDebateAsAcceptor } from '~/core/debates/server/publish-debate';

/**
 * Auto-publish a finished debate to the knowledge graph as the debate acceptor.
 *
 * Called by the client once a debate's media job reaches `succeeded`. Idempotent and safe to
 * retry: the Debate entity id is deterministic, so a second call after a successful publish
 * returns `already_published` instead of duplicating. Signs with the acceptor's key, never the
 * caller's — so no user auth is required, only the server-side acceptor env config.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing debate id.' }, { status: 400 });
  }

  try {
    const result = await publishDebateAsAcceptor(id);

    if (result.status === 'acceptor_not_configured') {
      // Not an error the client should retry — the deployment just hasn't enabled the acceptor.
      return NextResponse.json(result, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DebateNotPublishableError) {
      // The debate isn't finished processing yet; the client can retry later.
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error(`[debate-acceptor] failed to publish debate ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish debate.' },
      { status: 500 }
    );
  }
}
