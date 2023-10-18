import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// export const config = {
//   matcher: ['/', '/spaces', '/blog/:path*'],
// };

const MARKETING_PAGE_URL = 'https://geo.framer.website/';
const BLOG_URL = 'https://geo-blog.vercel.app';

export function middleware(request: NextRequest) {
  // const url = request.nextUrl.clone();
  // const pathname = new URL(url).pathname;

  // if (pathname === '/') return NextResponse.rewrite(MARKETING_PAGE_URL);
  // if (pathname.startsWith('/blog')) return NextResponse.rewrite(`${BLOG_URL}${pathname}`);

  return NextResponse.next();
}
