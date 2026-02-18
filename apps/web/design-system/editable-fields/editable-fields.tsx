'use client';

import { cva, cx } from 'class-variance-authority';
import Zoom from 'react-medium-image-zoom';
import Textarea from 'react-textarea-autosize';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef } from 'react';

import { VIDEO_ACCEPT } from '~/core/constants';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';
import { useVideoWithFallback } from '~/core/hooks/use-video-with-fallback';
import { useMutate } from '~/core/sync/use-mutate';
import { Relation } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { SmallButton, SquareButton } from '~/design-system/button';

import { Dots } from '../dots';
import { Trash } from '../icons/trash';
import { Upload } from '../icons/upload';
import { VideoSmall } from '../icons/video-small';

const textareaStyles = cva(
  // The react-textarea-autosize library miscalculates the height. We add a negative margin to compensate for this. This results in the correct line heights between both edit and browse modes. This only affects the editable titles of entity pages and editable titles of data blocks
  'm-0 w-full resize-none bg-transparent p-0 placeholder:text-grey-03 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'mb-[-1px] text-mainPage',
        body: 'mb-[-6.5px] text-body',
        tableCell: 'mt-[-1.25px] mb-[-2.25px] text-tableCell',
        tableProperty: '!text-tableProperty !text-grey-04',
        smallTitle: 'text-smallTitle',
      },
    },
    defaultVariants: {
      variant: 'body',
    },
  }
);

type TableStringFieldProps = {
  onChange: (value: string) => void;
  placeholder?: string;
  value?: string;
  variant?: 'tableCell' | 'tableProperty';
  autoFocus?: boolean;
};

export function TableStringField({ variant = 'tableCell', ...props }: TableStringFieldProps) {
  return (
    <Textarea
      {...props}
      onChange={e => {
        props.onChange(e.currentTarget.value);
      }}
      value={props.value || ''}
      className={textareaStyles({ variant })}
      autoFocus={props.autoFocus}
    />
  );
}

type PageStringFieldProps = {
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle' | 'tableCell';
  value?: string;
  autoFocus?: boolean;
  onEnterKey?: () => void;
};

export function PageStringField({ onChange, onEnterKey, ...props }: PageStringFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      value={props.value || ''}
      onChange={e => {
        onChange(e.currentTarget.value);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && onEnterKey) {
          e.preventDefault();
          onEnterKey();
        }
      }}
      className={textareaStyles({ variant: props.variant })}
      autoFocus={props.autoFocus}
    />
  );
}

type ImageVariant = 'avatar' | 'banner' | 'table-cell' | 'default' | 'gallery';

interface ImageZoomProps {
  imageSrc: string;
  variant?: ImageVariant;
}

const imageStyles: Record<ImageVariant, React.CSSProperties> = {
  default: {
    height: 80,
  },
  avatar: {
    height: 44,
    width: 44,
  },
  banner: {
    height: 44,
    width: 240,
  },
  'table-cell': {
    width: 60,
  },
  gallery: {
    height: 80,
  },
};

export function ImageZoom({ imageSrc, variant = 'default' }: ImageZoomProps) {
  const { src, onError } = useImageWithFallback(imageSrc);

  return (
    <Zoom>
      <div className="relative" style={imageStyles[variant]}>
        <img src={src} onError={onError} className="h-full rounded-lg object-cover" />
      </div>
    </Zoom>
  );
}

const blockImagePlaceholderImgs: Record<string, Record<'default' | 'hover', string>> = {
  avatar: {
    default: '/images/placeholders/Avatar_Default.svg',
    hover: '/images/placeholders/Avatar_Hover.svg',
  },
  gallery: {
    default: '/images/placeholders/Gallery_Default.svg',
    hover: '/images/placeholders/Gallery_Hover.svg',
  },
};

export function BlockImageField({ imageSrc, onFileChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const [hovered, setHovered] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    // This is a hack to get around label htmlFor triggering a file input not working with nested React components.
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        await onFileChange(file);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const placeholderImage = blockImagePlaceholderImgs[variant]?.[hovered ? 'hover' : 'default'] ?? undefined;

  return (
    <button
      onClick={handleFileInputClick}
      className={cx('flex h-full w-full place-items-center items-center', {
        'cursor-pointer': !imageSrc,
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imageSrc ? (
        <div className="pt-1">
          <ImageZoom variant={variant} imageSrc={imageSrc} />
        </div>
      ) : null}

      <div className="absolute h-full w-full">
        <img src={placeholderImage} className="h-full w-full overflow-visible object-cover" />
      </div>

      <div className="z-10 flex h-full w-full items-center justify-center">
        {isUploading ? (
          <Dots />
        ) : (
          <div className="cursor-pointer">
            <Upload color={hovered ? 'grey-04' : 'grey-03'} />
          </div>
        )}
        {imageSrc && <SquareButton onClick={onImageRemove} icon={<Trash color={hovered ? 'grey-04' : 'grey-03'} />} />}
      </div>

      <input
        ref={fileInputRef}
        accept="image/png, image/jpeg"
        id="avatar-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </button>
  );
}

interface ImageFieldProps {
  imageSrc?: string;
  onFileChange: (file: File) => Promise<void> | void;
  onImageRemove?: () => void;
  variant?: ImageVariant;
  horizontal?: boolean;
}

export function PageImageField({ imageSrc, onFileChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    // This is a hack to get around label htmlFor triggering a file input not working with nested React components.
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onFileChange) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        await onFileChange(file);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div>
      {imageSrc && (
        <div className="pt-1">
          <ImageZoom variant={variant} imageSrc={imageSrc} />
        </div>
      )}

      <div className="flex justify-center gap-2 pt-2">
        <SmallButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </SmallButton>
        {imageSrc && <SquareButton onClick={onImageRemove} icon={<Trash />} />}
      </div>

      <input
        ref={fileInputRef}
        accept="image/png, image/jpeg"
        id="avatar-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </div>
  );
}

interface TableImageFieldProps {
  imageRelation: Relation | undefined;
  spaceId: string;
  entityId: string;
  entityName?: string | null;
  propertyId: string;
  propertyName: string;
}

export function TableImageField({
  imageRelation,
  spaceId,
  entityId,
  entityName,
  propertyId,
  propertyName,
}: TableImageFieldProps) {
  const { storage } = useMutate();
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // For published data, toEntity.value contains the IPFS URL directly
  // For unpublished data, toEntity.value contains the entity ID (UUID), not a URL
  // We need to check if it's a valid image URL before using it
  const directImageUrl = imageRelation?.toEntity.value;
  const isValidImageUrl = directImageUrl && (directImageUrl.startsWith('ipfs://') || directImageUrl.startsWith('http'));
  const imageEntityId = imageRelation?.toEntity.id;
  const lookedUpImageSrc = useImageUrlFromEntity(imageEntityId, spaceId);
  const imageSrc = isValidImageUrl ? directImageUrl : lookedUpImageSrc;

  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        // Delete existing relation first, then create new one
        if (imageRelation) {
          storage.relations.delete(imageRelation);
        }

        await storage.images.createAndLink({
          file,
          fromEntityId: entityId,
          fromEntityName: entityName ?? null,
          relationPropertyId: propertyId,
          relationPropertyName: propertyName,
          spaceId,
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleImageRemove = useCallback(() => {
    if (imageRelation) {
      storage.relations.delete(imageRelation);
    }
  }, [imageRelation, storage.relations]);

  return (
    <div className="group flex w-full justify-between">
      {imageSrc ? (
        <div>
          <ImageZoom variant="table-cell" imageSrc={imageSrc} />
        </div>
      ) : (
        <SmallButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </SmallButton>
      )}

      {imageSrc && (
        <div className="ml-1 flex justify-center gap-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <SquareButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />} />
          <SquareButton onClick={handleImageRemove} icon={<Trash />} />
        </div>
      )}

      <input
        ref={fileInputRef}
        accept="image/png, image/jpeg"
        id="avatar-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </div>
  );
}

// Video Field Components

type VideoVariant = 'default' | 'table-cell';

interface VideoPlayerProps {
  videoSrc: string;
  variant?: VideoVariant;
}

const videoStyles: Record<VideoVariant, React.CSSProperties> = {
  default: {
    height: 80,
  },
  'table-cell': {
    maxWidth: 120,
  },
};

export function VideoPlayer({ videoSrc, variant = 'default' }: VideoPlayerProps) {
  const { src, onError } = useVideoWithFallback(videoSrc);

  if (!src) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-grey-01">
        <VideoSmall color="grey-04" />
      </div>
    );
  }

  return (
    <div className="relative" style={videoStyles[variant]}>
      <video src={src} onError={onError} controls className="h-full w-full rounded-lg object-cover" />
    </div>
  );
}

interface VideoFieldProps {
  videoSrc?: string;
  onFileChange: (file: File) => Promise<void> | void;
  onVideoRemove?: () => void;
  variant?: VideoVariant;
}

export function PageVideoField({ videoSrc, onFileChange, onVideoRemove, variant = 'default' }: VideoFieldProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onFileChange) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        await onFileChange(file);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div>
      {videoSrc ? (
        <div className="pt-1">
          <VideoPlayer variant={variant} videoSrc={videoSrc} />
        </div>
      ) : (
        <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-dashed border-grey-02 p-4">
          <div className="flex flex-col items-center gap-2">
            <VideoSmall color="grey-04" />
            <span className="text-sm text-grey-04">No video</span>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2 pt-2">
        <SmallButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </SmallButton>
        {videoSrc && <SquareButton onClick={onVideoRemove} icon={<Trash />} />}
      </div>

      <input
        ref={fileInputRef}
        accept={VIDEO_ACCEPT}
        id="video-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </div>
  );
}

export function TableVideoField({ videoSrc, onFileChange, onVideoRemove, variant = 'table-cell' }: VideoFieldProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        await onFileChange(file);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="group flex w-full justify-between">
      {videoSrc ? (
        <div>
          <VideoPlayer variant={variant} videoSrc={videoSrc} />
        </div>
      ) : (
        <SmallButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </SmallButton>
      )}

      {videoSrc && (
        <div className="flex justify-center gap-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <SquareButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />} />
          <SquareButton onClick={onVideoRemove} icon={<Trash />} />
        </div>
      )}

      <input
        ref={fileInputRef}
        accept={VIDEO_ACCEPT}
        id="video-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </div>
  );
}

// Video Thumbnail with Play Icon - for browse mode
interface VideoThumbnailWithPlayProps {
  videoSrc: string;
  variant?: VideoVariant;
}

export function VideoThumbnailWithPlay({ videoSrc, variant = 'default' }: VideoThumbnailWithPlayProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = React.useState(false);
  const { src, onError } = useVideoWithFallback(videoSrc);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause video and show first frame as thumbnail
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [src]);

  if (!src) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-grey-01">
        <VideoSmall color="grey-04" />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsFullscreenOpen(true)}
        className="group relative cursor-pointer"
        style={videoStyles[variant]}
      >
        {/* Video thumbnail (paused at first frame) */}
        <video
          ref={videoRef}
          src={src}
          onError={onError}
          className="h-full w-full rounded-lg object-cover"
          muted
          playsInline
          preload="metadata"
        />
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20 transition-colors group-hover:bg-black/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
            <VideoSmall color="text" />
          </div>
        </div>
      </button>

      {/* Fullscreen video viewer modal */}
      {isFullscreenOpen && <FullScreenVideoViewer videoSrc={src} onClose={() => setIsFullscreenOpen(false)} />}
    </>
  );
}

// Fullscreen Video Viewer Modal
interface FullScreenVideoViewerProps {
  videoSrc: string;
  onClose: () => void;
}

export function FullScreenVideoViewer({ videoSrc, onClose }: FullScreenVideoViewerProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="Close video"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Video player */}
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <video src={videoSrc} controls autoPlay className="max-h-[90vh] max-w-[90vw] rounded-lg" />
      </div>
    </div>
  );
}
