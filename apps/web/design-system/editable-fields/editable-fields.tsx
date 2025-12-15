import { cva, cx } from 'class-variance-authority';
import Zoom from 'react-medium-image-zoom';
import Textarea from 'react-textarea-autosize';

import * as React from 'react';
import { ChangeEvent, useRef } from 'react';

import { useOptimisticValueWithSideEffect } from '~/core/hooks/use-debounced-value';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';

import { SmallButton, SquareButton } from '~/design-system/button';

import { Dots } from '../dots';
import { Trash } from '../icons/trash';
import { Upload } from '../icons/upload';

const textareaStyles = cva(
  // The react-textarea-autosize library miscalculates the height. We add a negative margin to compensate for this. This results in the correct line heights between both edit and browse modes. This only affects the editable titles of entity pages and editable titles of data blocks
  'm-0 w-full resize-none bg-transparent p-0 placeholder:text-grey-03 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'mb-[-1px] text-mainPage',
        body: 'mb-[-6.5px] text-body',
        tableCell: 'mb-[-3.5px] text-tableCell',
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
  const { value: localValue, onChange: setLocalValue } = useOptimisticValueWithSideEffect({
    callback: props.onChange,
    delay: 1000,
    initialValue: props.value || '',
  });

  return (
    <Textarea
      {...props}
      onChange={e => setLocalValue(e.currentTarget.value)}
      value={localValue}
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
  shouldDebounce?: boolean;
  autoFocus?: boolean;
  onEnterKey?: () => void;
};

export function PageStringField({ ...props }: PageStringFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    value: localValue,
    onChange: setLocalValue,
    flush,
  } = useOptimisticValueWithSideEffect({
    callback: props.onChange,
    delay: 1500,
    initialValue: props.value || '',
  });

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      value={localValue}
      onChange={e => {
        if (props.shouldDebounce) {
          setLocalValue(e.currentTarget.value);
        } else {
          props.onChange(e.currentTarget.value);
        }
      }}
      onBlur={() => {
        // Flush on blur to ensure changes are saved when leaving the field
        flush();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && props.onEnterKey) {
          e.preventDefault();
          flush(); // Flush pending changes immediately
          props.onEnterKey?.();
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

export function TableImageField({ imageSrc, onFileChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
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

  return (
    <div className="group flex w-full justify-between">
      {imageSrc ? (
        <div>
          <ImageZoom variant={variant} imageSrc={imageSrc} />
        </div>
      ) : (
        <SmallButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </SmallButton>
      )}

      {imageSrc && (
        <div className="flex justify-center gap-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <SquareButton onClick={handleFileInputClick} icon={isUploading ? <Dots /> : <Upload />} />
          <SquareButton onClick={onImageRemove} icon={<Trash />} />
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
