'use server';

import { revalidateTag } from 'next/cache';

export async function refetch() {
  revalidateTag('proposals');
}
