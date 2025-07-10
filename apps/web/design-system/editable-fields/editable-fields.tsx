import { cva, cx } from 'class-variance-authority';
import Zoom from 'react-medium-image-zoom';
import Textarea from 'react-textarea-autosize';

import * as React from 'react';
import { ChangeEvent, useRef } from 'react';

import { useOptimisticValueWithSideEffect } from '~/core/hooks/use-debounced-value';
import { Services } from '~/core/services';
import { getImagePath } from '~/core/utils/utils';

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
    />
  );
}

type PageStringFieldProps = {
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle' | 'tableCell';
  value?: string;
};

export function PageStringField({ ...props }: PageStringFieldProps) {
  return (
    <Textarea
      {...props}
      value={props.value}
      onChange={e => props.onChange(e.currentTarget.value)}
      className={textareaStyles({ variant: props.variant })}
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
  return (
    <Zoom>
      <div className="relative" style={imageStyles[variant]}>
        <img src={getImagePath(imageSrc)} className="h-full rounded-lg object-cover" />
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

export function BlockImageField({ imageSrc, onImageChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const { ipfs } = Services.useServices();
  const [hovered, setHovered] = React.useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    // This is a hack to get around label htmlFor triggering a file input not working with nested React components.
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setIsUploading(true);
      const file = e.target.files[0];
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
      setIsUploading(false);
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
          <label htmlFor="avatar-file" className="cursor-pointer">
            <Upload color={hovered ? 'grey-04' : 'grey-03'} />
          </label>
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
  onImageChange: (imageSrc: string) => void;
  onImageRemove?: () => void;
  variant?: ImageVariant;
  horizontal?: boolean;
}

export function PageImageField({ imageSrc, onImageChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const { ipfs } = Services.useServices();

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
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
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
        <label htmlFor="avatar-file">
          <SmallButton onClick={handleFileInputClick} icon={<Upload />}>
            Upload
          </SmallButton>
        </label>
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

export function TableImageField({ imageSrc, onImageChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const { ipfs } = Services.useServices();
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
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
    }
  };

  return (
    <div className="group flex w-full justify-between">
      {imageSrc ? (
        <div>
          <ImageZoom variant={variant} imageSrc={imageSrc} />
        </div>
      ) : (
        <label htmlFor="avatar-file">
          <SmallButton onClick={handleFileInputClick} icon={<Upload />}>
            Upload
          </SmallButton>
        </label>
      )}

      {imageSrc && (
        <div className="flex justify-center gap-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <label htmlFor="avatar-file">
            <SquareButton onClick={handleFileInputClick} icon={<Upload />} />
          </label>
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
