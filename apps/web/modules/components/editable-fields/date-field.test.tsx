import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from './date-field';

describe('DateField', () => {
  it('should render placeholders if the date is empty in edit mode', () => {
    render(<DateField isEditing={true} value="" />);

    expect(screen.getByPlaceholderText('DD')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('MM')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('YYYY')).toBeInTheDocument();
    expect(screen.getByTestId('date-field-hour')).toBeInTheDocument();
    expect(screen.getByTestId('date-field-minute')).toBeInTheDocument();
  });

  it('should render initial fields when passed a valid value', () => {
    render(<DateField isEditing={true} value="1990-12-16T12:30:00.000Z" />);

    expect((screen.getByTestId('date-field-day') as HTMLInputElement).value).toBe('16');
    expect((screen.getByTestId('date-field-month') as HTMLInputElement).value).toBe('12');
    expect((screen.getByTestId('date-field-year') as HTMLInputElement).value).toBe('1990');
    expect((screen.getByTestId('date-field-hour') as HTMLInputElement).value).toBe('12');
    expect((screen.getByTestId('date-field-minute') as HTMLInputElement).value).toBe('30');
  });

  it('should render initial fields padded with 0s when passed valid value', () => {
    render(<DateField isEditing={true} value="0009-03-04T01:05:00.000Z" />);

    expect((screen.getByTestId('date-field-day') as HTMLInputElement).value).toBe('04');
    expect((screen.getByTestId('date-field-month') as HTMLInputElement).value).toBe('03');
    expect((screen.getByTestId('date-field-year') as HTMLInputElement).value).toBe('0009');
    expect((screen.getByTestId('date-field-hour') as HTMLInputElement).value).toBe('01');
    expect((screen.getByTestId('date-field-minute') as HTMLInputElement).value).toBe('05');
  });

  it('should render day when day changes', () => {
    render(<DateField isEditing={true} value="" />);

    const dayInput = screen.getByTestId('date-field-day') as HTMLInputElement;
    fireEvent.change(dayInput, { target: { value: '23' } });
    expect(dayInput.value).toBe('23');

    // Day has to be less than 31
    fireEvent.change(dayInput, { target: { value: '32' } });
    expect(screen.getByText('Entered day is not valid')).toBeInTheDocument();
  });

  it('should render month when month changes', () => {
    render(<DateField isEditing={true} value="" />);

    const monthInput = screen.getByTestId('date-field-month') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '10' } });
    expect(monthInput.value).toBe('10');

    // Month has to be less than 12
    fireEvent.change(monthInput, { target: { value: '13' } });
    expect(screen.getByText('Entered month is not valid')).toBeInTheDocument();
  });

  it('should render year when year changes', () => {
    render(<DateField isEditing={true} value="" />);

    const yearInput = screen.getByTestId('date-field-year') as HTMLInputElement;
    fireEvent.change(yearInput, { target: { value: '1990' } });
    expect(yearInput.value).toBe('1990');

    // Day has to be four characters
    fireEvent.change(yearInput, { target: { value: '5' } });
    expect(screen.getByText('Entered year is not valid')).toBeInTheDocument();
  });

  it('should render hour when hour changes', () => {
    render(<DateField isEditing={true} value="" />);

    const hourInput = screen.getByTestId('date-field-hour') as HTMLInputElement;
    fireEvent.change(hourInput, { target: { value: '12' } });
    expect(hourInput.value).toBe('12');

    // Hours greater than 12 are mapped to their 12 hour clock equivalent
    // e.g. 13 -> 1 or 17 -> 5
    fireEvent.change(hourInput, { target: { value: '13' } });
    expect(hourInput.value).toBe('13');
    expect(screen.getByText('Entered hour is not valid. Please use a 12 hour format.')).toBeInTheDocument();
  });

  it('should render minute when minute changes', () => {
    render(<DateField isEditing={true} value="" />);

    const minuteInput = screen.getByTestId('date-field-minute') as HTMLInputElement;
    fireEvent.change(minuteInput, { target: { value: '30' } });
    expect(minuteInput.value).toBe('30');

    fireEvent.change(minuteInput, { target: { value: '61' } });
    expect(minuteInput.value).toBe('61');
    expect(screen.getByText('Entered minute is not valid.')).toBeInTheDocument();
  });

  it('should toggle am/pm', () => {
    render(<DateField isEditing={true} value="1990-12-16T01:30:00.000Z" />);

    const monthInput = screen.getByText('am') as HTMLButtonElement;
    fireEvent.click(monthInput);
    expect(screen.getByText('pm')).toBeInTheDocument();
    fireEvent.click(monthInput);
    expect(screen.getByText('am')).toBeInTheDocument();
  });

  it('should output ISO UTC datetime string on blur', () => {
    const onBlur = vi.fn();

    render(<DateField isEditing={true} onBlur={onBlur} value="1990-12-16T01:30:00.000Z" />);

    const monthInput = screen.getByText('am') as HTMLButtonElement;
    fireEvent.click(monthInput);

    expect(onBlur).toHaveBeenCalled();
    expect(onBlur.mock.calls[0][0]).toBe('1990-12-16T13:30:00.000Z');
  });
});
