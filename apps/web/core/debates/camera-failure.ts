import { MediaDeviceFailure } from 'livekit-client';

/** What to tell someone whose camera LiveKit could not open. */
export function cameraFailureMessage(failure: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return 'Camera blocked. Allow it in your browser, then try again.';
    case MediaDeviceFailure.NotFound:
      return 'No camera found. Connect one, then try again.';
    case MediaDeviceFailure.DeviceInUse:
      return 'Your camera is in use by another app.';
    default:
      return 'Camera unavailable.';
  }
}
