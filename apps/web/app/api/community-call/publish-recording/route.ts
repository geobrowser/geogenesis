/**
 * Copies a finished call recording from curator-backend's S3 storage to public IPFS (Filebase)
 * and returns the CID. The browser then submits that CID as the event's recording relation
 * through governance.
 *
 * The copy runs server-side because a recording can be several GB: too large to hold in a
 * browser tab, and a browser fetch of the S3 URL hits CORS. It streams S3 to Filebase without
 * buffering, so peak memory stays flat regardless of size.
 *
 * The caller sends the recording `filename` plus their Privy token, which we exchange for a
 * presigned S3 URL via curator's editor-gated `recordings/url`. So only an editor who could
 * already play the recording can trigger a copy, and no presigned URL is trusted from the client.
 */
export const runtime = 'nodejs';
// Streaming multi-GB copy; give it the full Vercel ceiling.
export const maxDuration = 1800;

const FILEBASE_RPC_ADD = 'https://rpc.filebase.io/api/v0/add';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function log(...args: unknown[]) {
  console.log('[publish-recording]', ...args);
}

/**
 * The bare base name for the multipart Content-Disposition, stripped of path segments and
 * CR/LF/quotes. The recording `filename` is an S3 key with slashes; IPFS `add` reads slashes
 * as a directory path and wraps the file in a directory tree (returning the dir CID, not the
 * file's), so we send a flat name to get a single file back. Header-injection chars go too.
 */
function multipartFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  return base.replace(/[\r\n"]/g, '').slice(0, 200) || 'recording';
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.IPFS_KEY;
  if (!key) return json({ error: 'IPFS_KEY is not configured' }, 500);

  const base = process.env.CURATOR_BACKEND_URL;
  if (!base) return json({ error: 'CURATOR_BACKEND_URL is not configured' }, 500);

  const auth = req.headers.get('authorization');
  if (!auth) return json({ error: 'Missing Authorization header' }, 401);

  let filename: unknown;
  try {
    ({ filename } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof filename !== 'string' || !filename) {
    return json({ error: '`filename` is required' }, 400);
  }

  const started = Date.now();
  log('start', { filename });

  // Curator gates this endpoint on editor access, so the exchange doubles as our authorization
  // check: a non-editor or a bad token gets a 401/403 here and we stop.
  const urlRes = await fetch(`${base.replace(/\/$/, '')}/community-call/recordings/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ filename }),
  });
  if (!urlRes.ok) {
    const body = await urlRes.text().catch(() => '');
    log('recordings/url failed', urlRes.status, body.slice(0, 300));
    const status = urlRes.status === 401 || urlRes.status === 403 ? urlRes.status : 502;
    return json({ error: `Could not authorize recording access (${urlRes.status}): ${body.slice(0, 200)}` }, status);
  }
  const presigned = (await urlRes.json().catch(() => null)) as { url?: string } | null;
  if (!presigned?.url) {
    log('recordings/url returned no url', presigned);
    return json({ error: 'No presigned URL returned for recording' }, 502);
  }
  log('got presigned url', `${Date.now() - started}ms`);

  const s3 = await fetch(presigned.url);
  if (!s3.ok || !s3.body) {
    const body = await s3.text().catch(() => '');
    log('s3 fetch failed', s3.status, body.slice(0, 300));
    return json({ error: `Failed to fetch recording from storage (${s3.status})` }, 502);
  }
  const s3Body = s3.body;
  log('opened s3 stream', { contentLength: s3.headers.get('content-length'), type: s3.headers.get('content-type') });

  // Hand-rolled multipart so the S3 body streams through chunk by chunk and the file never sits
  // in memory whole. Omitting Content-Length means chunked encoding, which keeps it size-agnostic.
  const boundary = `----geo${crypto.randomUUID().replace(/-/g, '')}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${multipartFilename(filename)}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  const multipart = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(head);
      const reader = s3Body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        return;
      }
      controller.enqueue(tail);
      controller.close();
    },
  });

  let upload: Response;
  try {
    upload = await fetch(FILEBASE_RPC_ADD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipart,
      // Required by Node/undici to send a streaming request body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch (error) {
    log('filebase fetch threw', `${Date.now() - started}ms`, String(error));
    return json({ error: `Filebase upload failed: ${String(error).slice(0, 200)}` }, 502);
  }

  const uploadText = await upload.text();
  if (!upload.ok) {
    log('filebase upload failed', upload.status, `${Date.now() - started}ms`, uploadText.slice(0, 300));
    return json({ error: `Filebase upload failed (${upload.status}): ${uploadText.slice(0, 200)}` }, 502);
  }

  // Filebase's IPFS `add` returns newline-delimited JSON (one entry per added path). A flat
  // filename yields a single entry; parse leniently and take the last CID regardless.
  let hash: string | undefined;
  for (const line of uploadText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { Hash?: string };
      if (entry.Hash) hash = entry.Hash;
    } catch {
      // ignore progress / non-JSON lines
    }
  }
  if (!hash) {
    log('filebase returned no Hash', uploadText.slice(0, 800));
    return json({ error: 'Filebase did not return a CID' }, 502);
  }

  log('published', { cid: hash }, `${Date.now() - started}ms`);
  return json({ cid: `ipfs://${hash}` }, 200);
}
