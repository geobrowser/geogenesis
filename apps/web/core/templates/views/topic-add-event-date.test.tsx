import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TemplateAddResult } from '../models';
import { TopicTemplate } from './topic-template';

// The date input looks up the property's display format; no store in this test, so it uses the default.
vi.mock('~/core/sync/use-store', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/sync/use-store')>()),
  useQueryEntity: () => ({ entity: null }),
}));

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTopic(
  onAddEvent = vi.fn(async (): Promise<TemplateAddResult> => ({ ok: true, id: 'ev-new', spaceId: 's' }))
) {
  render(
    <TopicTemplate
      model={{
        id: 'topic-gaza',
        title: 'Gaza',
        lede: 'The war in Gaza',
        timelineHighlights: [{ id: 'ev-1', when: 'Oct 7, 2023', title: 'Attack on Israel', href: '/space/s/ev-1' }],
      }}
      actionCallbacks={{ onAddEvent, canOpenAddForm: () => true }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
  return { onAddEvent };
}

function typeDate(year: string, month: string, day: string) {
  const group = screen.getByRole('group', { name: 'Date' });
  const set = (placeholder: string, value: string) => {
    const input = within(group).getByPlaceholderText(placeholder);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };
  set('YYYY', year);
  set('MM', month);
  set('DD', day);
}

function typeTitle(title: string) {
  fireEvent.change(screen.getByPlaceholderText('e.g. UN Security Council adopts resolution'), {
    target: { value: title },
  });
}

const submit = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Add event' }).find(b => b.getAttribute('type') === 'submit') as HTMLElement
  );

describe('Topic timeline Add event date', () => {
  it("uses the app's date property input, not a free-text box", () => {
    renderTopic();
    const group = screen.getByRole('group', { name: 'Date' });
    expect(within(group).getByPlaceholderText('YYYY')).toBeInTheDocument();
    expect(within(group).getByPlaceholderText('MM')).toBeInTheDocument();
    expect(within(group).getByPlaceholderText('DD')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. 18 Nov 2026')).toBeNull();
  });

  it('submits a typed date as the ISO string the entity page writes, and the new row shows it', async () => {
    const { onAddEvent } = renderTopic();
    typeTitle('Ceasefire signed');
    typeDate('2026', '11', '18');
    expect(screen.getByText('Browse format · Nov 18, 2026 - 12:00 am')).toBeInTheDocument();

    await act(async () => submit());

    expect(onAddEvent).toHaveBeenCalledWith({
      title: 'Ceasefire signed',
      when: '2026-11-18T00:00:00.000Z',
      summary: undefined,
    });
    const row = screen.getByText('Ceasefire signed').closest('li') as HTMLElement;
    expect(within(row).getByText('Nov 18, 2026')).toBeInTheDocument();
  });

  it('keeps the date optional', async () => {
    const { onAddEvent } = renderTopic();
    typeTitle('Talks resume');
    await act(async () => submit());
    expect(onAddEvent).toHaveBeenCalledWith({ title: 'Talks resume', when: undefined, summary: undefined });
  });

  it('does not submit a partial date, and says why', () => {
    const { onAddEvent } = renderTopic();
    typeTitle('Ceasefire signed');
    const group = screen.getByRole('group', { name: 'Date' });
    const year = within(group).getByPlaceholderText('YYYY');
    fireEvent.change(year, { target: { value: '2026' } });
    fireEvent.blur(year);

    submit();

    expect(onAddEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full date, or leave it blank.');
  });

  it('does not submit an impossible date, even after a valid one', () => {
    const { onAddEvent } = renderTopic();
    typeTitle('Ceasefire signed');
    typeDate('2026', '11', '18');
    typeDate('2026', '02', '30');

    submit();

    expect(onAddEvent).not.toHaveBeenCalled();
    expect(screen.getByText('Day must be less than 29 for the entered month.')).toBeInTheDocument();
  });

  it('gives the date fields at least a 16px font, so iOS does not zoom in the phone sheet', () => {
    renderTopic();
    const group = screen.getByRole('group', { name: 'Date' });
    // `text-tableCell` is 1.1875rem (19px) in styles.css.
    for (const placeholder of ['YYYY', 'MM', 'DD']) {
      expect(within(group).getByPlaceholderText(placeholder)).toHaveClass('text-tableCell');
    }
  });
});
