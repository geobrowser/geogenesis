import { cva } from 'class-variance-authority';
import * as React from 'react';
import { ChangeEvent, useEffect, useRef } from 'react';
import { Button, SquareButton } from '~/modules/design-system/button';
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

interface ImageFieldProps {
  imageSrc?: string;
  onImageChange: (imageSrc: string) => void;
  onImageRemove: () => void;
  variant?: 'avatar' | 'banner';
}

export function AvatarImage({ imageSrc, children }: { imageSrc: string; children?: React.ReactNode }) {
  return (
    <div
      className="relative rounded bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${imageSrc})`,
        height: 64,
        width: 64,
      }}
    >
      {children}
    </div>
  );
}

export function ImageField({ imageSrc, onImageChange, onImageRemove, variant = 'avatar' }: ImageFieldProps) {
  const { network } = Services.useServices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputClick = () => {
    // This is a hack to get around label htmlFor not working with nested React components.
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
    <>
      <div className="flex justify-center pb-4">
        {imageSrc ? (
          <AvatarImage imageSrc={imageSrc}>
            <div className="absolute inset-0 m-auto flex grid place-items-center rounded bg-black/50 opacity-0 transition hover:opacity-100">
              <div className="flex gap-2">
                <label htmlFor="avatar-file">
                  <SquareButton onClick={handleFileInputClick} icon="upload" />
                </label>
                <SquareButton onClick={onImageRemove} icon="trash" />
              </div>
            </div>
          </AvatarImage>
        ) : (
          <div className="flex justify-center">
            <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center">
              <Button onClick={handleFileInputClick} variant="secondary" icon="upload">
                Upload
              </Button>
            </label>
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
    </>
  );
}
