import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DataType } from '~/core/types';

import { DateField } from './date-field';

// DateField looks up the property's display format; no store here, so it uses the default.
vi.mock('~/core/sync/use-store', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/sync/use-store')>()),
  useQueryEntity: () => ({ entity: null }),
}));

afterEach(cleanup);

function renderField(dataType: DataType, value = '') {
  const onBlur = vi.fn();
  const onValidityChange = vi.fn();
  render(
    <DateField
      isEditing
      value={value}
      propertyId="prop"
      dataType={dataType}
      onBlur={onBlur}
      onValidityChange={onValidityChange}
    />
  );
  return { onBlur, onValidityChange };
}

function type(placeholder: string, value: string, index = 0) {
  const input = screen.getAllByPlaceholderText(placeholder)[index];
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function typeDate(year: string, month: string, day: string) {
  type('YYYY', year);
  type('MM', month);
  type('DD', day);
}

const lastValidity = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

describe.each<DataType>(['DATE', 'DATETIME'])('DateField (%s) on the entity page', dataType => {
  it('writes a whole date as midnight UTC', () => {
    const { onBlur, onValidityChange } = renderField(dataType);
    typeDate('2026', '11', '18');
    expect(onBlur).toHaveBeenLastCalledWith({ value: '2026-11-18T00:00:00.000Z', format: undefined });
    expect(lastValidity(onValidityChange)).toEqual({ valid: true, empty: false });
  });

  it('writes nothing and does not throw for a partial date', () => {
    const { onBlur, onValidityChange } = renderField(dataType);
    expect(() => type('YYYY', '2026')).not.toThrow();
    expect(() => type('MM', '11')).not.toThrow();
    expect(onBlur).not.toHaveBeenCalled();
    expect(lastValidity(onValidityChange)).toEqual({ valid: false, empty: false });
  });

  it('writes nothing and does not throw for an impossible month', () => {
    const { onBlur, onValidityChange } = renderField(dataType);
    expect(() => typeDate('2026', '13', '01')).not.toThrow();
    expect(onBlur).not.toHaveBeenCalled();
    expect(lastValidity(onValidityChange)).toEqual({ valid: false, empty: false });
  });

  it('writes nothing and reports empty when every field is cleared', () => {
    const { onBlur, onValidityChange } = renderField(dataType, '2026-11-18T00:00:00.000Z');
    expect(() => typeDate('', '', '')).not.toThrow();
    // A DATETIME's hour and minute are filled from the stored value too; clear them as well.
    if (dataType === 'DATETIME') {
      expect(() => type('00', '', 0)).not.toThrow();
      expect(() => type('00', '', 1)).not.toThrow();
    }
    expect(onBlur).not.toHaveBeenCalled();
    expect(lastValidity(onValidityChange)).toEqual({ valid: true, empty: true });
  });
});

describe('DateField (DATETIME) with a time', () => {
  it('writes the UTC instant for a date and time', () => {
    const { onBlur } = renderField('DATETIME', '2026-11-18T00:00:00.000Z');
    const [hour, minute] = screen.getAllByPlaceholderText('00');
    fireEvent.change(hour, { target: { value: '03' } });
    fireEvent.blur(hour);
    fireEvent.change(minute, { target: { value: '30' } });
    fireEvent.blur(minute);
    expect(onBlur).toHaveBeenLastCalledWith({ value: '2026-11-18T03:30:00.000Z', format: undefined });
  });
});
