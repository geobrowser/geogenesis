'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { useState } from 'react';

import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';

import { PdfFile } from '../icons/file-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfZoom({
  pdfSrc,
  isEditing = false,
  className,
  width,
}: {
  pdfSrc: string;
  isEditing?: boolean;
  className?: string;
  width?: number;
}) {
  const { src } = useImageWithFallback(pdfSrc);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div
        className={`${className ? className : 'h-[120px] min-h-[120px] w-[173px] overflow-hidden'} ${isEditing ? 'border-b border-b-[#D9D9D9]' : 'rounded-lg'}`}
      >
        <Document
          file={src}
          onLoadSuccess={async pdf => {
            setNumPages(pdf.numPages);
            const metadata = (await pdf.getMetadata().catch(() => null)) as {
              info?: { Title?: string };
            };

            setFileName(metadata?.info?.Title ?? 'Document.pdf');
          }}
        >
          <Page width={width ?? 173} pageNumber={1} />
        </Document>
      </div>
      {isEditing && (
        <div className="flex flex-grow flex-col justify-between p-3">
          <span className="clamp-2 text-[16px] font-medium leading-[17px] text-[#35363A]">{fileName}</span>
          <div className="flex items-center gap-[5px]">
            <PdfFile className="h-3 w-3" />
            <span className="text-[11px] font-medium leading-[13px] text-grey-04">
              {numPages} page{numPages && numPages > 1 && 's'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
