import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENTITY_SIDE_PANEL_LAYER_SELECTOR } from '~/core/utils/entity-side-panel-link';

import { AddClaimPopover, AddEntityItemPopover } from './entity-overflow-menu';

const PHONE = '(max-width: 767px)';
const TOUCH = '(hover: none), (pointer: coarse)';

let matching = new Set<string>();

function mockMedia(queries: string[]) {
  matching = new Set(queries);
}

beforeEach(() => {
  mockMedia([]);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matching.has(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // jsdom has neither; the keyboard tests set them.
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (document.documentElement as { clientHeight?: unknown }).clientHeight;
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
});

function openClaimForm(onSubmit = vi.fn(), onRowClick = vi.fn()) {
  render(
    <div onClick={onRowClick}>
      <AddClaimPopover onSubmit={onSubmit} />
    </div>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
  return { onSubmit, onRowClick };
}

describe('AddFormSurface', () => {
  it('opens as an anchored popover on desktop', () => {
    openClaimForm();
    expect(screen.getByTestId('add-form-popover')).toBeInTheDocument();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('opens as a bottom sheet on a phone', () => {
    mockMedia([PHONE, TOUCH]);
    openClaimForm();
    const sheet = screen.getByRole('dialog', { name: 'Add claim' });
    expect(sheet).toHaveAttribute('data-testid', 'bottom-sheet');
    expect(screen.queryByTestId('add-form-popover')).toBeNull();
  });

  it('keeps the form and its submit wiring the same in the sheet', () => {
    mockMedia([PHONE, TOUCH]);
    const { onSubmit, onRowClick } = openClaimForm();

    fireEvent.click(screen.getByRole('button', { name: 'Judgment' }));
    fireEvent.change(screen.getByPlaceholderText('Write a clear, testable statement...'), {
      target: { value: 'Rents rose in 2025' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add claim' }).at(-1)!);

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Rents rose in 2025', kind: 'judgment', note: undefined });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Portaled out, but React still bubbles to the row the `+` sits in.
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('closes from its own Close button', () => {
    mockMedia([PHONE, TOUCH]);
    openClaimForm();
    fireEvent.click(screen.getByRole('button', { name: 'Close add claim' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the draft when the X closes it, as before', () => {
    openClaimForm();
    fireEvent.change(screen.getByPlaceholderText('Write a clear, testable statement...'), {
      target: { value: 'Rents rose in 2025' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close add claim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    expect(screen.getByPlaceholderText('Write a clear, testable statement...')).toHaveValue('Rents rose in 2025');
  });

  it('focuses the first field for a mouse and keyboard', () => {
    openClaimForm();
    expect(screen.getByPlaceholderText('Write a clear, testable statement...')).toHaveFocus();
  });

  it('does not focus a field on a touch screen, so the keyboard stays down', () => {
    mockMedia([PHONE, TOUCH]);
    openClaimForm();
    expect(screen.getByPlaceholderText('Write a clear, testable statement...')).not.toHaveFocus();
  });

  it('does not focus a field on a wide touch screen either', () => {
    mockMedia([TOUCH]);
    render(
      <AddEntityItemPopover
        label="Add event"
        primaryLabel="Event"
        primaryPlaceholder="What happened"
        onSubmit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(screen.getByTestId('add-form-popover')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What happened')).not.toHaveFocus();
  });

  it('gives fields a 16px font on phones, so iOS does not zoom', () => {
    openClaimForm();
    for (const field of [
      screen.getByPlaceholderText('Write a clear, testable statement...'),
      screen.getByPlaceholderText('Key citation or clarification...'),
    ]) {
      expect(field).toHaveClass('md:text-[16px]');
    }
  });

  it('counts a tap on the sheet backdrop as inside a layer, so the side panel stays open', () => {
    mockMedia([PHONE, TOUCH]);
    openClaimForm();
    const backdrop = document.querySelector('[data-bottom-sheet-backdrop]');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.closest(ENTITY_SIDE_PANEL_LAYER_SELECTOR)).not.toBeNull();
  });
});

describe('BottomSheet avoidKeyboard', () => {
  function stubViewport(height: number, offsetTop = 0) {
    const listeners = new Map<string, () => void>();
    const vv = {
      height,
      offsetTop,
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    vi.stubGlobal('visualViewport', vv);
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
    return {
      resize(next: number, nextOffset = 0) {
        vv.height = next;
        vv.offsetTop = nextOffset;
        act(() => listeners.get('resize')?.());
      },
    };
  }

  it('rides above the keyboard, fits in what is left and keeps the focused field in view', () => {
    mockMedia([PHONE, TOUCH]);
    const viewport = stubViewport(800);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    openClaimForm();
    const sheet = screen.getByRole('dialog', { name: 'Add claim' });
    expect(sheet.style.bottom).toBe('');

    const field = screen.getByPlaceholderText('Write a clear, testable statement...');
    field.focus();
    viewport.resize(450, 20);
    expect(sheet.style.bottom).toBe('330px');
    expect(sheet.style.maxHeight).toBe('438px');
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(field);

    viewport.resize(800);
    expect(sheet.style.bottom).toBe('');
  });

  it('leaves the scroll alone when it unmounts with the page', () => {
    mockMedia([PHONE, TOUCH]);
    stubViewport(800);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 1200 });

    const { unmount } = render(<AddClaimPopover onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    unmount();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('puts the page back where it was when the sheet closes', () => {
    mockMedia([PHONE, TOUCH]);
    stubViewport(800);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 1200 });

    openClaimForm();
    // iOS scrolls the page to the focused field.
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 1500 });
    fireEvent.click(screen.getByRole('button', { name: 'Close add claim' }));

    expect(scrollTo).toHaveBeenCalledWith(0, 1200);
  });
});
