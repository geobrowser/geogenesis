'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfZoom({ pdfSrc }: { pdfSrc: string }) {
  const { src } = useImageWithFallback(pdfSrc);

  return (
    <div className="h-[100px] w-[173px] overflow-hidden rounded-lg">
      <Document file={src}>
        <Page width={173} pageNumber={1} />
      </Document>
    </div>
  );
}
