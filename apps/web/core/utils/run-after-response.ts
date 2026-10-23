import { after } from 'next/server';

/** Keeps a serverless instance alive for `work` after the response; outside a request, just runs it. */
export function runAfterResponse(work: () => Promise<unknown>) {
  try {
    after(work);
  } catch {
    void work();
  }
}
