'use client';

import { Graph, SystemIds } from '@geoprotocol/geo-sdk';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Node, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import dynamic from 'next/dynamic';

import * as React from 'react';
import { useRef, useState } from 'react';

import { MAX_PDF_SIZE_BYTES, PDF_ACCEPT, PDF_TYPE, PDF_URL, VALID_PDF_TYPES } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { storage } from '~/core/sync/use-mutate';
import { useHydrateEntity, useRelations, useValues } from '~/core/sync/use-store';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { PdfFile } from '~/design-system/icons/file-pdf';
import { Relation } from '~/design-system/icons/relation';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const PdfZoom = dynamic(() => import('../../design-system/editable-fields/pdf-preview'), {
  ssr: false,
});

export const PdfNode = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  allowGapCursor: false,
  defining: true,

  addAttributes() {
    return {
      src: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'pdf-node' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pdf-node', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfNodeComponent);
  },
});

function PdfNodeComponent({ node, deleteNode }: NodeViewProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStore();
  const relation = blockRelations.find(b => b.block.id === id);
  const relationEntityId = relation?.entityId ?? '';

  return (
    <NodeViewWrapper>
      <div contentEditable="false" suppressContentEditableWarning className="pdf-node my-4">
        <PdfNodeChildren spaceId={spaceId} entityId={id} relationEntityId={relationEntityId} onRemove={deleteNode} />
      </div>
    </NodeViewWrapper>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

function PdfNodeChildren({
  spaceId,
  entityId,
  relationEntityId,
  onRemove,
}: {
  spaceId: string;
  entityId: string;
  relationEntityId: string;
  onRemove: () => void;
}) {
  useHydrateEntity({ id: entityId });

  const isEditing = useUserIsEditing(spaceId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Read the name from the store
  const nameValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === SystemIds.NAME_PROPERTY && v.spaceId === spaceId,
  });
  const storedName = nameValues?.[0]?.value ?? '';

  // Read the PDF URL from the store
  const pdfUrlValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === PDF_URL && v.spaceId === spaceId,
  });
  const storedPdfUrl = pdfUrlValues?.[0]?.value ?? '';

  // Read the Types relation (to PDF_TYPE) for deletion
  const typeRelations = useRelations({
    selector: r =>
      r.fromEntity.id === entityId &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.toEntity.id === PDF_TYPE &&
      r.spaceId === spaceId,
  });

  const [localName, setLocalName] = useState(storedName);

  React.useEffect(() => {
    setLocalName(storedName);
  }, [storedName]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  };

  const handleNameBlur = () => {
    if (localName !== storedName) {
      storage.entities.name.set(entityId, spaceId, localName);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadFileName('');
    setUploadFileSize(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (file: File) => {
    if (!VALID_PDF_TYPES.includes(file.type)) {
      setUploadError('Invalid file type. Please upload a PDF file.');
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setUploadError('File size exceeds 50MB limit');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadFileName(file.name.replace(/\.[^/.]+$/, ''));
    setUploadFileSize(file.size);

    abortControllerRef.current = new AbortController();

    let progressInterval: NodeJS.Timeout | undefined;

    try {
      progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 2, 90));
      }, 300);

      const { ops } = await Graph.createImage({
        blob: file,
        network: 'TESTNET',
      });

      // Bail out if the user cancelled while the upload was in flight
      if (abortControllerRef.current?.signal.aborted) return;

      setUploadProgress(100);

      // Extract the IPFS URL from the ops
      let ipfsUrl: string | undefined;
      for (const op of ops) {
        if (op.type === 'createEntity') {
          const values = (op as unknown as { values: Array<{ value: { type: string; value?: string } }> }).values;
          const ipfsValue = values?.find(pv => {
            const val = pv.value?.value;
            return typeof val === 'string' && val.startsWith('ipfs://');
          });
          if (ipfsValue) {
            ipfsUrl = ipfsValue.value?.value;
            break;
          }
        }
      }

      if (ipfsUrl) {
        // Save the PDF URL to the store using the PDF_URL property
        storage.values.set({
          id: ID.createValueId({
            entityId,
            propertyId: PDF_URL,
            spaceId,
          }),
          entity: { id: entityId, name: null },
          property: { id: PDF_URL, name: 'PDF URL', dataType: 'TEXT' },
          spaceId,
          value: ipfsUrl,
        });

        // Auto-set the name to the filename if no name is set
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        if (!storedName) {
          storage.entities.name.set(entityId, spaceId, fileName);
          setLocalName(fileName);
        }
      } else {
        console.error('Failed to extract IPFS URL from upload response');
        setUploadError('Upload succeeded but failed to process PDF URL. Please try again.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('PDF upload failed:', error);
        setUploadError('Failed to upload PDF. Please try again.');
      }
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsUploading(false);
      abortControllerRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy PDF block entity ID for: ', entityId);
    }
  };

  const onRemoveBlock = () => {
    setIsMenuOpen(false);

    // Delete the PDF URL value
    const pdfUrlValue = pdfUrlValues?.[0];
    if (pdfUrlValue) {
      storage.values.delete(pdfUrlValue);
    }

    // Delete the name value
    const nameValue = nameValues?.[0];
    if (nameValue) {
      storage.values.delete(nameValue);
    }

    // Delete the Types relation (PDF_TYPE)
    const typeRelation = typeRelations?.[0];
    if (typeRelation) {
      storage.relations.delete(typeRelation);
    }

    onRemove();
  };

  const hasPdf = Boolean(storedPdfUrl);
  const pdfSrc = hasPdf ? getImagePath(storedPdfUrl) : '';
  const uploadedBytes = Math.floor((uploadProgress / 100) * uploadFileSize);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg">
      {/* Title and context menu */}
      <div className="flex items-center justify-between px-4 pb-2">
        <input
          type="text"
          value={localName}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          placeholder="PDF title..."
          readOnly={!isEditing}
          className="flex-1 bg-transparent text-mediumTitle text-text placeholder:text-grey-03 focus:outline-hidden"
        />
        <Dropdown.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <Dropdown.Trigger className="ml-2 flex h-6 w-6 items-center justify-center rounded hover:bg-grey-01">
            {isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              sideOffset={8}
              className="z-1001 block w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
              align="end"
            >
              {isEditing && relationEntityId && (
                <MenuItem>
                  <Link
                    href={NavUtils.toEntity(spaceId, relationEntityId)}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span>View block relation</span>
                    <Relation />
                  </Link>
                </MenuItem>
              )}
              <MenuItem onClick={onCopyBlockId}>
                <span className="flex w-full items-center justify-between">
                  <span>Copy block ID</span>
                  <Copy color="grey-04" />
                </span>
              </MenuItem>
              {isEditing && (
                <MenuItem onClick={onRemoveBlock}>
                  <span className="flex w-full items-center justify-between">
                    <span>Remove</span>
                    <Trash color="grey-04" />
                  </span>
                </MenuItem>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>

      {/* PDF content or upload UI */}
      {hasPdf ? (
        <div className="h-full w-full">
          <PdfZoom pdfSrc={pdfSrc} isEditing={isEditing} className="h-full w-[400px] overflow-hidden rounded-sm" width={399} />
        </div>
      ) : isEditing ? (
        <div
          className={`flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 p-8 transition-colors ${
            isDragging ? 'bg-ctaPrimary/10' : ''
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" accept={PDF_ACCEPT} onChange={handleFileSelect} className="hidden" />

          {isUploading ? (
            <div className="flex w-full max-w-md flex-col items-center">
              <p className="mb-1 text-sm text-grey-04">Uploading</p>
              <p className="mb-3 text-lg font-medium text-text">{uploadFileName}</p>
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-grey-02">
                <div
                  className="h-full bg-ctaPrimary transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="flex w-full items-center justify-between">
                <p className="text-sm text-grey-04">
                  {uploadProgress}% {formatFileSize(uploadedBytes)} of {formatFileSize(uploadFileSize)}
                </p>
                <button
                  onClick={handleCancelUpload}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-grey-01"
                >
                  <CloseSmall color="grey-04" />
                </button>
              </div>
            </div>
          ) : isDragging ? (
            <div className="flex flex-col items-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: '#002FD924' }}
              >
                <PdfFile color="ctaPrimary" />
              </div>
              <p className="text-lg font-medium text-ctaPrimary">Drop PDF here</p>
            </div>
          ) : (
            <>
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: '#002FD924' }}
              >
                <PdfFile color="ctaPrimary" />
              </div>
              <p
                className="mb-1 font-semibold text-text"
                style={{ fontSize: '19px', lineHeight: '21px', letterSpacing: '-0.5px' }}
              >
                Drag & drop or select a file
              </p>
              <p className="mb-4 text-grey-04" style={{ fontSize: '14px', lineHeight: '12px', letterSpacing: '0px' }}>
                Max 50mb · PDF
              </p>
              <button
                onClick={handleUploadClick}
                className="flex items-center gap-2 rounded-md border border-grey-02 px-3 py-1.5 text-text transition-colors hover:bg-grey-01"
              >
                <Upload />
                Select file
              </button>
              {uploadError && <p className="text-red-500 mt-4 text-sm">{uploadError}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 p-8">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-divider">
            <PdfFile color="grey-04" />
          </div>
          <p className="text-sm text-grey-04">No PDF</p>
        </div>
      )}
    </div>
  );
}
