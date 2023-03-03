import { cva } from 'class-variance-authority';
import * as React from 'react';
import { ChangeEvent, useEffect, useRef } from 'react';
import Zoom from 'react-medium-image-zoom';
import { SmallButton, SquareButton } from '~/modules/design-system/button';
import { Services } from '~/modules/services';

const textareaStyles = cva(
  'w-full h-full resize-none bg-transparent overflow-hidden m-0 p-0 placeholder:text-grey-02 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'text-mainPage',
        body: 'text-body',
        tableCell: 'text-tableCell',
        smallTitle: 'text-smallTitle',
      },
    },
    defaultVariants: {
      variant: 'body',
    },
  }
);

interface TableStringFieldProps {
  onBlur: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  value?: string;
}

export function TableStringField({ ...props }: TableStringFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(props.value || '');
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onBlur={props.onBlur}
      onChange={e => setLocalValue(e.currentTarget.value)}
      value={localValue}
      className={textareaStyles({ variant: 'tableCell' })}
    />
  );
}

interface PageStringFieldProps {
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
}

export function PageStringField({ ...props }: PageStringFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Manually keep the height of the textarea in sync with its content.
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';

      if (props.variant === 'body') {
        // This aligns the bottom of the text area with the sum of line heights * number of lines
        // for body text.
        ref.current.style.height = ref.current.scrollHeight - 4 + 'px';
      }
    }
  });

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onChange={props.onChange}
      value={props.value}
      className={textareaStyles({ variant: props.variant })}
    />
  );
}

type ImageVariant = 'avatar' | 'banner' | 'default';

interface ImageZoomProps {
  imageSrc: string;
  variant?: ImageVariant;
}

export function ImageZoom({ imageSrc, variant = 'default' }: ImageZoomProps) {
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
  };

  return (
    <Zoom>
      <div className="relative rounded" style={imageStyles[variant]}>
        <img src={imageSrc} className="h-full object-cover" />
      </div>
    </Zoom>
  );
}

interface ImageFieldProps {
  imageSrc?: string;
  onImageChange: (imageSrc: string) => void;
  onImageRemove: () => void;
  variant?: ImageVariant;
  horizontal?: boolean;
}

export function PageImageField({ imageSrc, onImageChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const { network } = Services.useServices();
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
      const imageSrc = await network.uploadFile(file);
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
        <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center">
          <SmallButton onClick={handleFileInputClick} icon="upload">
            Upload
          </SmallButton>
        </label>
        {imageSrc && <SquareButton onClick={onImageRemove} icon="trash" />}
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
  const { network } = Services.useServices();
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
      const imageSrc = await network.uploadFile(file);
      onImageChange(imageSrc);
    }
  };

  return (
    <div className="group flex justify-between">
      {imageSrc && (
        <div>
          <ImageZoom variant={variant} imageSrc={imageSrc} />
        </div>
      )}

      {imageSrc && (
        <div className="flex justify-center gap-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center">
            <SquareButton onClick={handleFileInputClick} icon="upload" />
          </label>
          <SquareButton onClick={onImageRemove} icon="trash" />
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
