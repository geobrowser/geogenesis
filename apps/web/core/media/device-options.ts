import type { RoomOptions } from 'livekit-client';

export type MediaDeviceOption = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;

export const systemDefaultAudioOutput: MediaDeviceOption = {
  deviceId: 'default',
  groupId: 'default',
  kind: 'audiooutput',
  label: 'System default',
};

export const mediaDeviceLabels: Record<MediaDeviceKind, string> = {
  audioinput: 'Microphone',
  audiooutput: 'Speaker',
  videoinput: 'Camera',
};

export function toMediaDeviceOptions(devices: MediaDeviceInfo[]): MediaDeviceOption[] {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind,
    label: device.label || `${mediaDeviceLabels[device.kind]} ${index + 1}`,
  }));
}

export type MediaDeviceIds = {
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
};

/** A remembered input is a preference, so a missing device must not prevent capture. */
export function withMediaDeviceOptions(devices: MediaDeviceIds, options: RoomOptions): RoomOptions {
  return {
    ...options,
    ...(devices.audioInputId
      ? { audioCaptureDefaults: { ...options.audioCaptureDefaults, deviceId: { ideal: devices.audioInputId } } }
      : {}),
    ...(devices.videoInputId
      ? { videoCaptureDefaults: { ...options.videoCaptureDefaults, deviceId: { ideal: devices.videoInputId } } }
      : {}),
    ...(devices.audioOutputId ? { audioOutput: { ...options.audioOutput, deviceId: devices.audioOutputId } } : {}),
  };
}

/** Firefox can require authorization and return a new ID for the same speaker. Call on a user gesture. */
export async function authorizeAudioOutput(deviceId: string): Promise<MediaDeviceInfo | undefined> {
  const mediaDevices = navigator.mediaDevices as
    | (MediaDevices & {
        selectAudioOutput?: (options: { deviceId: string }) => Promise<MediaDeviceInfo>;
      })
    | undefined;
  if (deviceId !== systemDefaultAudioOutput.deviceId && mediaDevices?.selectAudioOutput) {
    return mediaDevices.selectAudioOutput({ deviceId });
  }
}

/** LiveKit can resolve false instead of rejecting a device that was not actually selected. */
export async function switchMediaDevice(
  room: { switchActiveDevice?: (kind: MediaDeviceKind, deviceId: string) => Promise<unknown> },
  kind: MediaDeviceKind,
  deviceId: string
) {
  if (!room.switchActiveDevice) throw new Error('Device routing unavailable');
  const switched = await room.switchActiveDevice(kind, deviceId);
  // A default input can report its physical ID instead of the requested alias.
  if (switched === false && !(kind !== 'audiooutput' && deviceId === 'default')) {
    throw new Error('Device switch failed');
  }
}
