import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScheduleField } from './schedule-field';

afterEach(cleanup);

const VALID_SCHEDULE = 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH';

describe('ScheduleField', () => {
  describe('browse mode', () => {
    it('renders formatted schedule text', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={false} />);
      const el = screen.getByTestId('schedule-field-value');
      expect(el.textContent).toContain('Weekly on Thursday');
      expect(el.textContent).toContain('5:00 PM');
    });

    it('renders empty when value is empty', () => {
      render(<ScheduleField value="" isEditing={false} />);
      const el = screen.getByTestId('schedule-field-value');
      expect(el.textContent).toBe('');
    });
  });

  describe('edit mode', () => {
    it('renders structured form inputs', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      expect(screen.getByTestId('schedule-form')).toBeTruthy();
      expect(screen.getByTestId('schedule-start-date')).toBeTruthy();
      expect(screen.getByTestId('schedule-start-time')).toBeTruthy();
      expect(screen.getByTestId('schedule-end-time')).toBeTruthy();
      expect(screen.getByTestId('schedule-freq')).toBeTruthy();
    });

    it('populates fields from existing value', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      const startDate = screen.getByTestId('schedule-start-date') as HTMLInputElement;
      const startTime = screen.getByTestId('schedule-start-time') as HTMLInputElement;
      const endTime = screen.getByTestId('schedule-end-time') as HTMLInputElement;
      const freq = screen.getByTestId('schedule-freq') as HTMLSelectElement;

      expect(startDate.value).toBe('2026-03-05');
      expect(startTime.value).toBe('17:00');
      expect(endTime.value).toBe('18:00');
      expect(freq.value).toBe('WEEKLY');
    });

    it('shows day buttons when frequency is WEEKLY', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      expect(screen.getByTestId('schedule-days')).toBeTruthy();
      expect(screen.getByTestId('schedule-day-TH')).toBeTruthy();
    });

    it('hides day buttons when frequency is not WEEKLY', () => {
      const dailySchedule = 'DTSTART:20260305T170000Z\nRRULE:FREQ=DAILY';
      render(<ScheduleField value={dailySchedule} isEditing={true} />);
      expect(screen.queryByTestId('schedule-days')).toBeNull();
    });

    it('calls onChange with serialized value when start date changes', () => {
      const onChange = vi.fn();
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} onChange={onChange} />);
      const startDate = screen.getByTestId('schedule-start-date') as HTMLInputElement;

      fireEvent.change(startDate, { target: { value: '2026-04-10' } });

      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall).toContain('DTSTART:20260410T170000Z');
    });

    it('calls onChange with serialized value when frequency changes', () => {
      const onChange = vi.fn();
      render(<ScheduleField value="DTSTART:20260305T170000Z" isEditing={true} onChange={onChange} />);
      const freq = screen.getByTestId('schedule-freq') as HTMLSelectElement;

      fireEvent.change(freq, { target: { value: 'DAILY' } });

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall).toContain('RRULE:FREQ=DAILY');
    });

    it('shows a preview when valid', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      const preview = screen.getByTestId('schedule-field-preview');
      expect(preview.textContent).toContain('Weekly on Thursday');
    });

    it('calls onChange with empty string when start date is cleared', () => {
      const onChange = vi.fn();
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} onChange={onChange} />);
      const startDate = screen.getByTestId('schedule-start-date') as HTMLInputElement;

      fireEvent.change(startDate, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith('');
    });

    it('shows interval input when frequency is selected', () => {
      const onChange = vi.fn();
      render(<ScheduleField value="DTSTART:20260305T170000Z" isEditing={true} onChange={onChange} />);
      const freq = screen.getByTestId('schedule-freq') as HTMLSelectElement;

      // Select a frequency to reveal the interval input
      fireEvent.change(freq, { target: { value: 'WEEKLY' } });

      const interval = screen.getByTestId('schedule-interval') as HTMLInputElement;
      expect(interval.value).toBe('1');
    });
  });
});
