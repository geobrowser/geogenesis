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
    it('renders a textarea with the current value', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;
      expect(textarea.value).toBe(VALID_SCHEDULE);
    });

    it('shows a preview when the value is valid', () => {
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} />);
      const preview = screen.getByTestId('schedule-field-preview');
      expect(preview.textContent).toContain('Weekly on Thursday');
    });

    it('calls onChange on blur with valid input', () => {
      const onChange = vi.fn();
      render(<ScheduleField value="" isEditing={true} onChange={onChange} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'DTSTART:20260305T170000Z' } });
      fireEvent.blur(textarea);

      expect(onChange).toHaveBeenCalledWith('DTSTART:20260305T170000Z');
    });

    it('does not call onChange on blur with invalid input', () => {
      const onChange = vi.fn();
      render(<ScheduleField value="" isEditing={true} onChange={onChange} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'DTSTART:invalid' } });
      fireEvent.blur(textarea);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows validation errors on blur with invalid input', () => {
      render(<ScheduleField value="" isEditing={true} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'DTSTART:invalid' } });
      fireEvent.blur(textarea);

      const errorsContainer = screen.getByTestId('schedule-field-errors');
      expect(errorsContainer).toBeTruthy();
      expect(errorsContainer.textContent).toContain('Invalid DTSTART date');
    });

    it('clears errors when user starts typing again', () => {
      render(<ScheduleField value="" isEditing={true} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;

      // Trigger an error
      fireEvent.change(textarea, { target: { value: 'DTSTART:invalid' } });
      fireEvent.blur(textarea);
      expect(screen.getByTestId('schedule-field-errors')).toBeTruthy();

      // Start typing again
      fireEvent.change(textarea, { target: { value: 'DTSTART:20260305T170000Z' } });
      expect(screen.queryByTestId('schedule-field-errors')).toBeNull();
    });

    it('allows clearing the field', () => {
      const onChange = vi.fn();
      render(<ScheduleField value={VALID_SCHEDULE} isEditing={true} onChange={onChange} />);
      const textarea = screen.getByTestId('schedule-field-input') as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: '' } });
      fireEvent.blur(textarea);

      expect(onChange).toHaveBeenCalledWith('');
      expect(screen.queryByTestId('schedule-field-errors')).toBeNull();
    });
  });
});
