import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeviceOptionGroup } from './device-option-group';

const devices = [
  { deviceId: 'mic-a', groupId: 'g1', kind: 'audioinput' as const, label: 'Built-in Microphone' },
  { deviceId: 'mic-b', groupId: 'g2', kind: 'audioinput' as const, label: 'USB Microphone' },
];

afterEach(() => {
  cleanup();
});

describe('DeviceOptionGroup', () => {
  it('reports the picked device', () => {
    const onChange = vi.fn();
    render(
      <DeviceOptionGroup label="Select a microphone" options={devices} selectedDeviceId="mic-a" onChange={onChange} />
    );

    fireEvent.click(screen.getByText('USB Microphone'));
    expect(onChange).toHaveBeenCalledWith('mic-b');
  });

  it('takes no input while disabled', () => {
    const onChange = vi.fn();
    render(
      <DeviceOptionGroup
        label="Select a speaker"
        options={devices}
        selectedDeviceId="mic-a"
        disabled
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('USB Microphone'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // This component was lifted out of the debate pre-join screen so the claim-exploration voice dock
  // could render the identical picker, and the dock's designs draw taller rows than the pre-join
  // popover has room for. The two sets of metrics have to stay apart: the popover is sized to its
  // trigger, so a few extra pixels a row cost it both device labels and rows before it scrolls.
  it('keeps the pre-join row metrics for everything but the framed variant', () => {
    const { rerender } = render(
      <DeviceOptionGroup label="Select a microphone" options={devices} selectedDeviceId="mic-a" onChange={vi.fn()} />
    );

    const compact = screen.getByText('USB Microphone').closest('button');
    expect(compact).toHaveClass('min-h-9', 'px-3', 'py-2');

    rerender(
      <DeviceOptionGroup
        label="Select a microphone"
        options={devices}
        selectedDeviceId="mic-a"
        framed
        onChange={vi.fn()}
      />
    );

    const roomy = screen.getByText('USB Microphone').closest('button');
    expect(roomy).toHaveClass('px-4', 'py-3');
    expect(roomy).not.toHaveClass('min-h-9');
  });
});
