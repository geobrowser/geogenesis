import { renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useScopeHeldOver } from './use-scope-holdover';

describe('useScopeHeldOver', () => {
  it('holds nothing while the pages are the current scope’s', () => {
    const { result } = renderHook(() => useScopeHeldOver('space-1', false));

    expect(result.current).toBe(false);
  });

  // The case the mask is for: the scope moved, and what React Query has to answer with meanwhile
  // was fetched under the one before it.
  it('reports a holdover once the scope changes under placeholder data', () => {
    const { result, rerender } = renderHook(({ scope, placeholder }) => useScopeHeldOver(scope, placeholder), {
      initialProps: { scope: 'space-1', placeholder: false },
    });

    rerender({ scope: 'space-2', placeholder: true });

    expect(result.current).toBe(true);
  });

  // And releases it, rather than leaving the list empty for good.
  it('lets go once the new scope’s pages land', () => {
    const { result, rerender } = renderHook(({ scope, placeholder }) => useScopeHeldOver(scope, placeholder), {
      initialProps: { scope: 'space-1', placeholder: false },
    });

    rerender({ scope: 'space-2', placeholder: true });
    rerender({ scope: 'space-2', placeholder: false });

    expect(result.current).toBe(false);
  });

  // A search or topic change is a key change too, and holding the previous answer through it is
  // the point of `keepPreviousData` — the rows on screen are that same page, so the menu over them
  // is honest. Only a scope change makes the held facets describe spaces the rows no longer can.
  it('holds nothing when a filter changes but the scope does not', () => {
    const { result, rerender } = renderHook(({ scope, placeholder }) => useScopeHeldOver(scope, placeholder), {
      initialProps: { scope: 'space-1', placeholder: false },
    });

    rerender({ scope: 'space-1', placeholder: true });

    expect(result.current).toBe(false);
  });

  // `null` is "no scope in force", which is a different question from any particular scope — not
  // an absence to be treated as equal to whatever came before.
  it('treats an unscoped query and a scoped one as different scopes', () => {
    const { result, rerender } = renderHook(({ scope, placeholder }) => useScopeHeldOver(scope, placeholder), {
      initialProps: { scope: null as string | null, placeholder: false },
    });

    rerender({ scope: 'space-1', placeholder: true });

    expect(result.current).toBe(true);
  });
});
