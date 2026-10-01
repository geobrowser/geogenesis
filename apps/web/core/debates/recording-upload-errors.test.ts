import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import { putRecordingPart } from './recording-stream';
import {
  RecordingUploadError,
  classifyRecordingUploadError,
  recordingStorageHttpError,
  recordingUploadErrorProperties,
  redactRecordingUploadErrorMessage,
} from './recording-upload-errors';

vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));

function domException(name: string, message = name) {
  return new DOMException(message, name);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyRecordingUploadError', () => {
  it.each([
    ['a fetch that never got a response', new TypeError('Failed to fetch'), 'fetch_failed'],
    ["Safari's fetch failure", new TypeError('Load failed'), 'fetch_failed'],
    ['an XHR with no response', new RecordingUploadError('Recording upload failed.', 'network'), 'network'],
    [
      'object storage refusing a part',
      recordingStorageHttpError('Recording part upload failed (403)', 403),
      'http_403',
    ],
    [
      'a part the server did not sign',
      new RecordingUploadError('No upload URL', 'part_url_missing'),
      'part_url_missing',
    ],
    ['a full disk', domException('QuotaExceededError'), 'storage_quota'],
    [
      'a Dexie abort caused by the quota',
      Object.assign(new Error('aborted'), { name: 'AbortError', inner: domException('QuotaExceededError') }),
      'storage_quota',
    ],
    [
      'a lost IndexedDB connection',
      domException('UnknownError', 'Connection to Indexed Database server lost.'),
      'indexeddb',
    ],
    ['the same, as a plain Error', new Error('Connection to Indexed Database server lost.'), 'indexeddb'],
    [
      'a closed Dexie database',
      Object.assign(new Error('Database has been closed'), { name: 'DatabaseClosedError' }),
      'indexeddb',
    ],
    ['a blob whose data is gone', domException('NotReadableError'), 'blob_unreadable'],
    ['an aborted request', domException('AbortError'), 'aborted'],
    ['a timed-out request', domException('TimeoutError'), 'timeout'],
    ['the geo-chat session timing out', new Error('Geo Chat session request timed out.'), 'timeout'],
    ['a missing identity token', new Error('Sign in to use debates.'), 'auth_required'],
    ['anything else', new Error('Something odd'), 'unknown'],
    ['a thrown string', 'boom', 'unknown'],
  ])('files %s under a stable code', (_label, error, code) => {
    expect(classifyRecordingUploadError(error, true)).toBe(code);
  });

  it('files a no-response failure as offline when the browser says it is offline', () => {
    expect(classifyRecordingUploadError(new TypeError('Failed to fetch'), false)).toBe('offline');
    expect(classifyRecordingUploadError(new RecordingUploadError('Recording upload failed.', 'network'), false)).toBe(
      'offline'
    );
    // An answer from the server is not the connection, whatever the browser thinks.
    expect(classifyRecordingUploadError(recordingStorageHttpError('failed (500)', 500), false)).toBe('http_500');
  });

  it("keeps geo-chat's own code, and falls back to the status when it sent none", () => {
    expect(classifyRecordingUploadError(new GeoChatRequestError('x', 'recording_not_ready', 400), true)).toBe(
      'recording_not_ready'
    );
    expect(classifyRecordingUploadError(new GeoChatRequestError('Bad Gateway', null, 502), true)).toBe('http_502');
  });
});

describe('recordingUploadErrorProperties', () => {
  it('always carries a code and the error name for a client-side failure', () => {
    expect(recordingUploadErrorProperties(new TypeError('Load failed'), { online: true })).toEqual({
      error_code: 'fetch_failed',
      http_status: null,
      error_name: 'TypeError',
      error_message: 'Load failed',
    });
    expect(
      recordingUploadErrorProperties(recordingStorageHttpError('Recording upload failed (403)', 403), { online: true })
    ).toEqual({
      error_code: 'http_403',
      http_status: 403,
      error_name: 'RecordingUploadError',
      error_message: 'Recording upload failed (403)',
    });
  });

  it("withholds geo-chat's message, which is prose for a person and can name one", () => {
    expect(
      recordingUploadErrorProperties(
        new GeoChatRequestError('Alice cancelled this debate', 'recording_cancelled', 400),
        {
          online: true,
        }
      )
    ).toEqual({
      error_code: 'recording_cancelled',
      http_status: 400,
      error_name: 'GeoChatRequestError',
      error_message: null,
    });
  });
});

describe('redactRecordingUploadErrorMessage', () => {
  it('removes URLs, signatures, object keys and filenames', () => {
    const redacted = redactRecordingUploadErrorMessage(
      'PUT https://geo-chat.r2.cloudflarestorage.com/debates/0190/1.local.webm?X-Amz-Signature=abc failed; ' +
        'key debates/0190/recordings/1.local.webm, file 1-slot.local.mp4, blob:https://geobrowser.io/9f0c, ' +
        'token 0123456789abcdef0123456789abcdef01 ?upload_id=xyz'
    )!;
    for (const leak of ['https', 'r2.', 'X-Amz', 'webm', 'mp4', 'debates/', 'blob:', '0123456789abcdef', 'xyz']) {
      expect(redacted).not.toContain(leak);
    }
    expect(redacted).toContain('PUT <url> failed');
  });

  it('leaves an ordinary message alone, caps a long one and drops an empty one', () => {
    expect(redactRecordingUploadErrorMessage('Recording part upload failed (403)')).toBe(
      'Recording part upload failed (403)'
    );
    expect(redactRecordingUploadErrorMessage('Connection to Indexed Database server lost.')).toBe(
      'Connection to Indexed Database server lost.'
    );
    expect(redactRecordingUploadErrorMessage('version 1.2.3 failed')).toBe('version 1.2.3 failed');
    expect(redactRecordingUploadErrorMessage('x '.repeat(300))!.length).toBeLessThanOrEqual(200);
    expect(redactRecordingUploadErrorMessage('   ')).toBeNull();
    expect(redactRecordingUploadErrorMessage(null)).toBeNull();
  });
});

describe('putRecordingPart', () => {
  it('reports a refused part with its HTTP status as the code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const error = await putRecordingPart(
      { url: 'https://bucket.test/part?sig=1', method: 'PUT', headers: {}, expires_at: '2030-01-01T00:00:00Z' },
      new Blob(['part'])
    ).catch(caught => caught);
    expect(error).toBeInstanceOf(RecordingUploadError);
    expect(recordingUploadErrorProperties(error, { online: true })).toMatchObject({
      error_code: 'http_403',
      http_status: 403,
    });
  });
});
