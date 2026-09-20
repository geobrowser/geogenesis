import * as React from 'react';

/**
 * Layout effect on the client, plain effect on the server.
 *
 * A layout effect runs during commit, ahead of every passive effect in the tree — which is what
 * makes it the right phase for work that must be in place before other components' effects, rather
 * than merely usually in place first. The server has no layout phase and React warns if you ask for
 * one, hence the swap.
 *
 * Two callers rely on the ordering for different reasons: `useAnyModalOpen` has to read before
 * paint, and `PlaybackDiagnostics` has to install its instrumentation before the playback effects
 * it observes.
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;
