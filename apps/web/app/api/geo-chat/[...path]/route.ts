const DEFAULT_GEO_CHAT_API_BASE_URL = 'http://127.0.0.1:18080';

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-request-id'];

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyGeoChatRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyGeoChatRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyGeoChatRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyGeoChatRequest(request, context);
}

async function proxyGeoChatRequest(request: Request, context: RouteContext) {
  const targetUrl = await buildTargetUrl(request, context);
  const headers = buildForwardHeaders(request.headers);
  const method = request.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[geo-chat/proxy] upstream fetch failed', { targetUrl, error });
    return Response.json(
      {
        error: {
          code: 'upstream_unavailable',
          message: 'Chat backend is unavailable.',
        },
      },
      { status: 502 }
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildResponseHeaders(upstream.headers),
  });
}

async function buildTargetUrl(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const baseUrl = new URL(getGeoChatApiBaseUrl());
  baseUrl.pathname = joinPaths(baseUrl.pathname, path.map(encodeURIComponent).join('/'));
  baseUrl.search = requestUrl.search;
  return baseUrl.toString();
}

function getGeoChatApiBaseUrl() {
  const configured = process.env.GEO_CHAT_API_BASE_URL;
  if (configured) return configured;

  const publicConfigured = process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL;
  if (publicConfigured?.startsWith('http://') || publicConfigured?.startsWith('https://')) {
    return publicConfigured;
  }

  return DEFAULT_GEO_CHAT_API_BASE_URL;
}

function buildForwardHeaders(headers: Headers) {
  const forwarded = new Headers();

  for (const name of ['accept', 'authorization', 'content-type', 'x-request-id']) {
    const value = headers.get(name);
    if (value) forwarded.set(name, value);
  }

  return forwarded;
}

function buildResponseHeaders(headers: Headers) {
  const forwarded = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value) forwarded.set(name, value);
  }

  return forwarded;
}

function joinPaths(basePath: string, childPath: string) {
  return `${basePath.replace(/\/+$/, '')}/${childPath}`.replace(/\/+/g, '/');
}
