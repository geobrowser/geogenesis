'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { Space } from '~/core/io/dto/spaces';

import { EntitySearchAutocomplete } from '~/design-system/autocomplete/entity-search-autocomplete';
import { SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Upload } from '~/design-system/icons/upload';
import { Warning } from '~/design-system/icons/warning';
import { Spinner } from '~/design-system/spinner';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import {
  columnMappingAtom,
  fileNameAtom,
  headersAtom,
  importRevisionAtom,
  importSessionIdAtom,
  rowCountAtom,
  stepAtom,
  typesColumnIndexAtom,
  selectedTypeAtom,
} from './atoms';
import type { ParseResult } from './csv-parse.worker';
import { ImportSessionStore } from './import-session-store';
import { normalizeHeader, normalizeHeaderForMatch } from './header-normalization';
import { useAutoMapColumns } from './use-auto-map-columns';
import { useImportSchema } from './use-import-schema';
import { useImportSession } from './use-import-session';

type GenerateProps = {
  spaceId: string;
  space: Space;
};

const TYPES_HEADER_NORMALIZED = 'types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

/** Parse CSV in a Web Worker so the main thread stays responsive. */
function parseCSVInWorker(text: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./csv-parse.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<ParseResult>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(new Error(err.message ?? 'Worker error'));
      worker.terminate();
    };
    worker.postMessage(text);
  });
}

export const Generate = ({ spaceId }: GenerateProps) => {
  const router = useRouter();
  const { isEditor, isMember } = useAccessControl(spaceId);
  const [, setStep] = useAtom(stepAtom);
  const [fileName, setFileName] = useAtom(fileNameAtom);
  const [selectedType, setSelectedType] = useAtom(selectedTypeAtom);
  const [typesColumnIndex, setTypesColumnIndex] = useAtom(typesColumnIndexAtom);
  const [columnMapping, setColumnMapping] = useAtom(columnMappingAtom);
  const headers = useAtomValue(headersAtom);
  const rowCount = useAtomValue(rowCountAtom);
  const setHeaders = useSetAtom(headersAtom);
  const setRowCount = useSetAtom(rowCountAtom);
  const setImportSessionId = useSetAtom(importSessionIdAtom);
  const setImportRevision = useSetAtom(importRevisionAtom);
  const pathname = usePathname();
  const spacePath = pathname?.split('/import')[0] ?? '/space';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { autoMap, isAutoMapping } = useAutoMapColumns(spaceId);
  const autoMappedSignatureRef = useRef<string | null>(null);

  const hasTypesColumn = useMemo(() => {
    const normalized = headers.map(h => h?.trim().toLowerCase() ?? '');
    const idx = normalized.indexOf(TYPES_HEADER_NORMALIZED);
    return idx >= 0 ? idx : undefined;
  }, [headers]);

  const { schema } = useImportSchema({ selectedTypeId: selectedType?.id, spaceId });
  const { resetMappedState, clearGeneratedChanges } = useImportSession(spaceId);

  // Map "Name" header to NAME_PROPERTY and match schema properties by header name
  useEffect(() => {
    if (headers.length === 0) return;
    const normalizedHeaders = headers.map(h => normalizeHeader(h ?? ''));
    const propNameToId = schema.length > 0
      ? new Map(schema.map(p => [normalizeHeader((p.name ?? p.id) ?? ''), p.id]))
      : new Map<string, string>();

    setColumnMapping(prev => {
      let changed = false;
      const next = { ...prev };
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (typesColumnIndex !== undefined && i === typesColumnIndex) continue;
        if (next[i] !== undefined) continue;
        const raw = normalizedHeaders[i];
        const normalized = normalizeHeaderForMatch(raw);
        if (normalized === 'name') {
          next[i] = SystemIds.NAME_PROPERTY;
          changed = true;
        } else {
          const propId = propNameToId.get(normalized) ?? propNameToId.get(raw);
          if (propId) {
            next[i] = propId;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [headers, schema, setColumnMapping, typesColumnIndex]);

  // Auto-map unmapped columns via space-wide property search after schema matching
  useEffect(() => {
    if (headers.length === 0) return;
    // Wait for schema matching to finish first when a selectedType is set
    if (selectedType && schema.length === 0) return;
    if (isAutoMapping) return;

    // Check if there are unmapped columns
    const hasUnmapped = headers.some(
      (_, i) => i !== typesColumnIndex && columnMapping[i] === undefined
    );
    if (!hasUnmapped) return;

    const signature = `${fileName ?? ''}::${headers.join('|')}`;
    if (autoMappedSignatureRef.current === signature) return;
    autoMappedSignatureRef.current = signature;
    autoMap();
  }, [headers, schema, selectedType, typesColumnIndex, columnMapping, autoMap, isAutoMapping, fileName]);

  const MAX_FILE_SIZE_MB = 10;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | undefined>(undefined);
  const [isParsing, setIsParsing] = useState(false);

  /** Clear session store and reset metadata atoms. */
  const clearImportData = useCallback(
    (sessionId: string | null) => {
      if (sessionId) ImportSessionStore.clear(sessionId);
      setHeaders([]);
      setRowCount(0);
      setImportSessionId(null);
      setImportRevision(r => r + 1);
    },
    [setHeaders, setRowCount, setImportSessionId, setImportRevision]
  );

  const currentSessionId = useAtomValue(importSessionIdAtom);

  const resetSessionState = useCallback(() => {
    resetMappedState();
    autoMappedSignatureRef.current = null;
  }, [resetMappedState]);

  const processFile = useCallback(
    async (file: File | null) => {
      setFileError(null);
      if (!file) return;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        resetSessionState();
        setFileError(`File must be under ${MAX_FILE_SIZE_MB}mb`);
        setFileName(undefined);
        setFileSizeBytes(undefined);
        clearImportData(currentSessionId);
        setStep('step1');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'csv') {
        resetSessionState();
        setFileError('Only CSV files are supported');
        setFileName(undefined);
        setFileSizeBytes(undefined);
        clearImportData(currentSessionId);
        setStep('step1');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      resetSessionState();
      clearImportData(currentSessionId);
      setFileName(file.name);
      setFileSizeBytes(file.size);
      setIsParsing(true);

      try {
        const tParse = performance.now();
        // v1 limitation: file.text() allocates the full string on the main thread.
        // Future: pass File object to Worker and read there.
        const text = await file.text();
        if (process.env.NODE_ENV === 'development') console.log(`[import:parse] file.text(): ${(performance.now() - tParse).toFixed(1)}ms — ${(text.length / 1024).toFixed(0)}KB`);
        const tWorker = performance.now();
        const result = await parseCSVInWorker(text);
        if (process.env.NODE_ENV === 'development') console.log(`[import:parse] worker parse: ${(performance.now() - tWorker).toFixed(1)}ms — ok=${result.ok}`);

        if (!result.ok) {
          throw new Error(result.message);
        }

        if (process.env.NODE_ENV === 'development') console.log(`[import:parse] result: ${result.rowCount} data rows, ${result.headers.length} columns`);

        const sessionId = crypto.randomUUID();
        ImportSessionStore.set(sessionId, {
          headers: result.headers,
          rows: result.rows,
          rowCount: result.rowCount,
        });

        // Tiny atom updates — only metadata, no row data in React state
        setImportSessionId(sessionId);
        setHeaders(result.headers);
        setRowCount(result.rowCount);
        setImportRevision(r => r + 1);
        setStep('step2');
        if (process.env.NODE_ENV === 'development') console.log(`[import:parse] DONE — total ${(performance.now() - tParse).toFixed(1)}ms`);
      } catch (error) {
        console.warn('[import] Failed to parse CSV file', error);
        resetSessionState();
        setFileError('Unable to parse CSV. Please check the file format and try again.');
        setFileName(undefined);
        setFileSizeBytes(undefined);
        clearImportData(currentSessionId);
        setStep('step1');
      } finally {
        setIsParsing(false);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [resetSessionState, setFileName, setStep, clearImportData, currentSessionId, setHeaders, setRowCount, setImportSessionId, setImportRevision]
  );

  const handleFileInputClick = () => fileInputRef.current?.click();

  const handleProcessFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input?.files?.[0] ?? fileInputRef.current?.files?.[0] ?? null;
    processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    processFile(file ?? null);
  };

  const handleDeleteFile = useCallback(() => {
    resetSessionState();
    setFileName(undefined);
    setFileSizeBytes(undefined);
    clearImportData(currentSessionId);
    setStep('step1');
  }, [resetSessionState, setFileName, setStep, clearImportData, currentSessionId]);

  const handleNavigateToReview = useCallback(() => {
    router.push(`/space/${spaceId}/import/review`);
  }, [router, spaceId]);

  const hasFile = headers.length > 0;

  const step3Content = useMemo(() => {
    if (!hasFile) {
      return (
        <div className="rounded-lg border border-grey-02 bg-grey-01 px-4 py-3">
          <p className="text-metadata text-grey-04">Upload a file to continue</p>
        </div>
      );
    }
    if (!selectedType && typesColumnIndex === undefined) {
      return (
        <div className="rounded-lg border border-grey-02 bg-grey-01 px-4 py-3">
          <p className="text-metadata text-grey-04">Choose a type in Step 2 to continue.</p>
        </div>
      );
    }
    if (isAutoMapping) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-grey-01 px-4 py-3">
          <Spinner />
          <Text variant="smallButton" className="text-text">Mapping columns to properties...</Text>
        </div>
      );
    }
    const unmappedCount = headers.filter(
      (_, i) => i !== typesColumnIndex && columnMapping[i] === undefined
    ).length;
    const dataPointsNeedLinking = unmappedCount * rowCount;
    const hasUnmapped = unmappedCount > 0;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-grey-01 px-4 py-3">
        {hasUnmapped ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex shrink-0 items-center" aria-hidden>
                <Warning color="red-01" />
              </span>
              <Text variant="smallButton" className="text-text">
                {unmappedCount} {unmappedCount === 1 ? 'property needs' : 'properties need'} linking
              </Text>
              <span className="flex shrink-0 items-center" aria-hidden>
                <Warning color="red-01" />
              </span>
              <Text variant="smallButton" className="text-text">
                {dataPointsNeedLinking.toLocaleString('en-US')} data points need linking
              </Text>
            </div>
            <SmallButton
              type="button"
              variant="secondary"
              onClick={handleNavigateToReview}
            >
              Fix data
            </SmallButton>
          </>
        ) : (
          <>
            <p className="text-metadata text-grey-04">All columns are mapped. Review your data before importing.</p>
            <SmallButton
              type="button"
              variant="secondary"
              className="shrink-0 rounded-full"
              onClick={handleNavigateToReview}
            >
              Review
            </SmallButton>
          </>
        )}
      </div>
    );
  }, [hasFile, selectedType, typesColumnIndex, isAutoMapping, headers, columnMapping, rowCount, handleNavigateToReview]);

  if (!isEditor && !isMember) return null;

  return (
    <div className="overflow-visible">
      <div className="mb-6">
        <Link href={spacePath}>
          <SquareButton icon={<ArrowLeft />} />
        </Link>
      </div>

      <h1 className="mb-10 text-mainPage font-semibold text-text">Import data</h1>

      <div className="mb-8">
        <div className="mb-3 flex flex-col">
          <span className="font-semibold text-purple">Step 1</span>
          <span className="text-button font-medium text-text">Upload your file</span>
        </div>
        <input
          ref={fileInputRef}
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleProcessFile}
          className="sr-only"
          aria-label="Select CSV file"
        />
        {isParsing ? (
          <div className="flex min-h-[200px] items-center justify-center gap-3 rounded-lg border-2 border-dashed border-grey-02 bg-white px-4 py-8">
            <Spinner />
            <Text variant="smallButton" className="text-text">Parsing CSV...</Text>
          </div>
        ) : fileName ? (
          <div
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-grey-02 bg-grey-01 px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold text-text">{fileName}</span>
              {fileSizeBytes != null && (
                <span className="shrink-0 text-metadata text-grey-04">{formatFileSize(fileSizeBytes)}</span>
              )}
            </div>
            <SmallButton type="button" variant="secondary" onClick={handleDeleteFile} className="shrink-0 rounded-full">
              Delete
            </SmallButton>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleFileInputClick}
            onKeyDown={(e) => e.key === 'Enter' && handleFileInputClick()}
            className={`flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
              dragActive ? 'border-purple bg-ctaTertiary' : 'border-grey-02 bg-white'
            }`}
          >
            <p className="text-button font-semibold text-text">Drag & drop or select a file</p>
            <p className="text-metadata text-grey-04">Max {MAX_FILE_SIZE_MB}mb - CSV</p>
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <SmallButton type="button" icon={<Upload />} variant="secondary" onClick={handleFileInputClick}>
                Select file
              </SmallButton>
            </div>
          </div>
        )}
        {fileError && <p className="mt-2 text-smallButton text-red-01">{fileError}</p>}
      </div>

      <div className="mb-8">
        <div className="mb-3 flex flex-col">
          <span className="font-semibold text-purple">Step 2</span>
          <span className="text-button font-medium text-text">Map types</span>
        </div>
        {!fileName || !hasFile ? (
          <div className="rounded-lg border border-grey-02 bg-grey-01 px-4 py-3">
            <p className="text-metadata text-grey-04">Upload a file to continue</p>
          </div>
        ) : (
          <div className="rounded-lg border border-grey-02 bg-white px-4 py-3">
            <p className="mb-2 text-metadata text-grey-04">
              {fileName} · Type - Find or create a type to use
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {selectedType ? (
                  <>
                    <span className="text-smallButton font-medium text-text">{selectedType.name}</span>
                    <SmallButton
                      variant="ghost"
                      onClick={() => {
                        clearGeneratedChanges();
                        setSelectedType(null);
                      }}
                      className="text-grey-04"
                    >
                      Change type
                    </SmallButton>
                  </>
                ) : (
                  <div className="relative w-[192px]">
                    <EntitySearchAutocomplete
                      placeholder="Search for a type..."
                      dropdownClassName="!w-[384px] min-w-[320px]"
                      filterByTypes={[SystemIds.SCHEMA_TYPE]}
                      onDone={(result) => {
                        clearGeneratedChanges();
                        setSelectedType({ id: result.id, name: result.name });
                        setTypesColumnIndex(undefined);
                        setStep('step3');
                      }}
                      itemIds={[]}
                    />
                  </div>
                )}
              </div>
              <span className="shrink-0 text-button text-grey-04">or</span>
              <div className="shrink-0">
                <Dropdown
                  align="start"
                  trigger={
                    <span>
                      {typesColumnIndex !== undefined ? `Column: ${headers[typesColumnIndex] ?? ''}` : 'Select column from CSV'}
                    </span>
                  }
                  options={headers.map((header, index) => ({
                    label: header ?? `Column ${index + 1}`,
                    value: String(index),
                    disabled: false,
                    onClick: () => {
                      clearGeneratedChanges();
                      setTypesColumnIndex(index);
                      setSelectedType(null);
                      setColumnMapping(prev => {
                        if (prev[index] === undefined) return prev;
                        const next = { ...prev };
                        delete next[index];
                        return next;
                      });
                      setStep('step3');
                    },
                  }))}
                />
              </div>
            </div>
            {hasTypesColumn !== undefined && (
              <p className="mt-2 text-metadata text-grey-04">This CSV has a &quot;Types&quot; column. You can use it as the types column or choose a constant type above.</p>
            )}
          </div>
        )}
      </div>

      <div className="mb-8">
        <div className="mb-3 flex flex-col">
          <span className="font-semibold text-purple">Step 3</span>
          <span className="text-button font-medium text-text">Map properties and data</span>
        </div>
        {step3Content}
      </div>
    </div>
  );
};
