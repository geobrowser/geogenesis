import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Cookie } from './modules/cookie';
import { ENV_PARAM_NAME } from './modules/constants';

// export const config = {
//   matcher: ['/', '/spaces', '/blog/:path*'],
// };

const MARKETING_PAGE_URL = 'https://geo.framer.website/';
const BLOG_URL = 'https://geo-blog.vercel.app';

export function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/') return NextResponse.rewrite(MARKETING_PAGE_URL);
  if (pathname.startsWith('/blog')) return NextResponse.rewrite(`${BLOG_URL}${pathname}`);

  const env = Cookie.getEnv(request.url);
  const response = NextResponse.next();
  if (env) response.cookies.set(ENV_PARAM_NAME, env);
  return response;
}
