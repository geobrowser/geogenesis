import { cva, cx } from 'class-variance-authority';
import Zoom from 'react-medium-image-zoom';
import Textarea from 'react-textarea-autosize';

import * as React from 'react';
import { ChangeEvent, useEffect, useRef } from 'react';

import { Services } from '~/core/services';
import { getImagePath } from '~/core/utils/utils';

import { SmallButton, SquareButton } from '~/design-system/button';

import { Dots } from '../dots';
import { Trash } from '../icons/trash';
import { Upload } from '../icons/upload';
import { Map } from '../map';

const textareaStyles = cva(
  // The react-textarea-autosize library miscalculates the height by 1 pixel. We add a negative margin
  // of -1px to compensate for this. This results in the correct line heights between both edit and
  // browse modes. This only affects the editable title of entity pages.
  'm-0 -mb-[1px] w-full resize-none bg-transparent p-0 text-body placeholder:text-grey-03 focus:outline-none',
  {
    variants: {
      variant: {
        mainPage: 'text-mainPage',
        body: 'text-body',
        tableCell: '-mb-0 text-tableCell',
        smallTitle: 'text-smallTitle',
      },
    },
    defaultVariants: {
      variant: 'body',
    },
  }
);

const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
  let timer: number | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    // @ts-expect-error incorrect type
    timer = setTimeout(() => fn(...args), delay);
  };
};

interface TableStringFieldProps {
  onChange: (value: string) => void;
  placeholder?: string;
  value?: string;
}

export function TableStringField({ ...props }: TableStringFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const { onChange } = props;

  // Apply debounce effect
  const debouncedCallback = debounce((value: string) => {
    onChange(value);
  }, 1000);

  // Handle input changes
  const handleChange = (value: string) => {
    setLocalValue(value);
    debouncedCallback(value);
  };

  useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(props.value || '');
  }, [props.value]);

  return (
    <Textarea
      {...props}
      onChange={e => handleChange(e.currentTarget.value)}
      value={localValue}
      className={textareaStyles({ variant: 'tableCell' })}
    />
  );
}

interface PageStringFieldProps {
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
}

interface PageGeoLocationFieldProps {
  onChange: (value: string, isBrowseMode: string) => void;
  placeholder?: string;
  variant?: 'mainPage' | 'body' | 'smallTitle';
  value?: string;
  isBrowseMode?: string;
}

export function PageStringField({ ...props }: PageStringFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const { onChange } = props;

  useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(props.value || '');
  }, [props.value]);

  // Apply debounce effect
  const debouncedCallback = debounce((value: string) => {
    onChange(value);
  }, 1000);

  // Handle input changes
  const handleChange = (value: string) => {
    setLocalValue(value);
    debouncedCallback(value);
  };

  return (
    <Textarea
      {...props}
      onChange={e => handleChange(e.currentTarget.value)}
      value={localValue}
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
        <img src={placeholderImage} className="h-full w-full object-cover" />
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

export function GeoLocationPointFields({ ...props }: PageGeoLocationFieldProps) {
  const [localValue, setLocalValue] = React.useState(props.value || '');
  const [browserMode, setBrowseMode] = React.useState(
    props.isBrowseMode === undefined ? true : props.isBrowseMode === 'MAP'
  );
  const [pointValues, setPointsValues] = React.useState({
    latitude: props.value?.split(',')[0]?.replaceAll(' ', '') || '',
    longitude: props.value?.split(',')[1]?.replaceAll(' ', '') || '',
  });

  const validNumberPattern = /^-?\d*\.?\d*$/;

  const handlePointValueChange = (label: string, newValue: string) => {
    if (newValue === '' || validNumberPattern.test(newValue)) {
      setPointsValues(prev => ({
        ...prev,
        [label]: newValue,
      }));
    } else {
      console.error('Invalid input');
    }
  };

  useEffect(() => {
    setLocalValue(`${pointValues.latitude},${pointValues.longitude}`);
    debouncedCallback(`${pointValues.latitude},${pointValues.longitude}`);
  }, [pointValues, browserMode]);

  const { onChange } = props;

  useEffect(() => {
    // Update local value if value prop changes from outside the component
    setLocalValue(props.value || '');
  }, [props.value]);

  // Apply debounce effect
  const debouncedCallback = debounce((value: string) => {
    onChange(value, browserMode ? 'MAP' : '');
  }, 1000);

  // Handle browse mode toggle
  const handleBrowseMode = () => {
    setBrowseMode(prev => !prev);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="mt-[3px] flex w-full justify-between  leading-[29px]">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <label className="text-[19px] text-bodySemibold font-normal text-text">Latitude</label>
            <span className="w-[11px] border-t border-t-[#606060]"></span>
            <Textarea
              {...props}
              onChange={e => handlePointValueChange('latitude', e.currentTarget.value)}
              value={pointValues.latitude}
              className={`${textareaStyles({ variant: props.variant })} max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[19px] text-bodySemibold font-normal text-text">Longitude</label>
            <span className="w-[11px] border-t border-t-[#606060]"></span>
            <Textarea
              {...props}
              onChange={e => handlePointValueChange('longitude', e.currentTarget.value)}
              value={pointValues.longitude}
              className={`${textareaStyles({ variant: props.variant })} max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap font-normal placeholder:font-normal`}
            />
          </div>
        </div>
        <div className="flex h-7 items-center gap-[6px]">
          {/* Toggle */}
          <div className="relative h-3 w-5 cursor-pointer rounded-lg bg-black" onClick={handleBrowseMode}>
            <div
              className={`absolute top-[1px] h-[10px] w-[10px] rounded-full bg-white transition-all duration-300 ease-in-out ${browserMode ? 'right-[1px]' : 'right-[9px]'}`}
            ></div>
          </div>
          <span className="text-[1rem] font-normal leading-5 text-grey-04">Show map in browse mode</span>
        </div>
      </div>
      <Map
        browseMode={browserMode}
        latitude={parseFloat(pointValues.latitude) || 0}
        longitude={parseFloat(pointValues.longitude) || 0}
      />
    </div>
  );
}
