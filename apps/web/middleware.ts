import { NextResponse } from 'next/server';

// only run the rewrite on the root route
export const config = {
  matcher: '/',
};

export function middleware() {
  return NextResponse.rewrite('https://statuses-remaining-039723.framer.app/');
}
