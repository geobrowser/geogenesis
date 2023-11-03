'use client';

import cx from 'classnames';
import { useInView } from 'framer-motion';

import { Children, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '~/design-system/button';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';

type SliderProps = {
  label: string;
  children: ReactNode;
};

export const Slider = ({ label, children }: SliderProps) => {
  return (
    <>
      <MobileSlider label={label}>{children}</MobileSlider>
      <DesktopSlider label={label}>{children}</DesktopSlider>
    </>
  );
};

const MobileSlider = ({ label, children }: SliderProps) => {
  const [page, setPage] = useState<number>(0);
  const prefix = kebabCase(label);

  const cards = Children.toArray(children);
  const slides = useMemo(() => chunk(cards, 2), [cards]);

  const hasPrev = page > 0;
  const handlePrev = useCallback(() => {
    if (page > 0) {
      const element = document.getElementById(`${prefix}-slider-mobile-${page - 1}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasNext = page < slides.length - 1;
  const handleNext = useCallback(() => {
    if (page < slides.length - 1) {
      const element = document.getElementById(`${prefix}-slider-mobile-${page + 1}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [page, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {slides.length > 1 && (
        <div className="mb-2 hidden h-8 items-center justify-between xl:flex">
          <h4 className="text-smallTitle">{label}</h4>
          <div className="flex items-center gap-5 text-text">
            <IconButton
              onClick={handlePrev}
              icon={<LeftArrowLong />}
              color="grey-04"
              className={cx(!hasPrev && 'opacity-25')}
              disabled={!hasPrev}
            />
            <IconButton
              onClick={handleNext}
              icon={<RightArrowLong />}
              color="grey-04"
              className={cx(!hasNext && 'opacity-25')}
              disabled={!hasNext}
            />
          </div>
        </div>
      )}
      <div className="no-scrollbar -mx-4 hidden w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] snap-x snap-mandatory overflow-y-clip overflow-x-scroll xl:flex">
        {slides.map((slide: ReactNode, index: number) => (
          <Slide key={index} mode="mobile" index={index} id={`${prefix}-slider-mobile-${index}`} onChange={setPage}>
            {slide}
          </Slide>
        ))}
      </div>
    </>
  );
};

const DesktopSlider = ({ label, children }: SliderProps) => {
  const [page, setPage] = useState<number>(0);
  const prefix = kebabCase(label);

  const cards = Children.toArray(children);
  const slides = useMemo(() => chunk(cards, 3), [cards]);

  const hasPrev = page > 0;
  const handlePrev = useCallback(() => {
    if (page > 0) {
      const element = document.getElementById(`${prefix}-slider-desktop-${page - 1}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasNext = page < slides.length - 1;
  const handleNext = useCallback(() => {
    if (page < slides.length - 1) {
      const element = document.getElementById(`${prefix}-slider-desktop-${page + 1}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [page, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {slides.length > 1 && (
        <div className="mb-2 flex h-8 items-center justify-between xl:hidden">
          <h4 className="text-smallTitle">{label}</h4>
          <div className="flex items-center gap-5 text-text">
            <IconButton
              onClick={handlePrev}
              icon={<LeftArrowLong />}
              color="grey-04"
              className={cx(!hasPrev && 'opacity-25')}
              disabled={!hasPrev}
            />
            <IconButton
              onClick={handleNext}
              icon={<RightArrowLong />}
              color="grey-04"
              className={cx(!hasNext && 'opacity-25')}
              disabled={!hasNext}
            />
          </div>
        </div>
      )}
      <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] snap-x snap-mandatory overflow-y-clip overflow-x-scroll xl:hidden">
        {slides.map((slide: ReactNode, index: number) => (
          <Slide key={index} mode="desktop" index={index} id={`${prefix}-slider-desktop-${index}`} onChange={setPage}>
            {slide}
          </Slide>
        ))}
      </div>
    </>
  );
};

type SlideProps = {
  mode: 'mobile' | 'desktop';
  index: number;
  id: string;
  onChange: (index: number) => void;
  children: ReactNode;
};

const Slide = ({ mode, index, id, onChange, children }: SlideProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 1 });

  useEffect(() => {
    if (isInView) {
      onChange(index);
    }
  }, [isInView, index, onChange]);

  return (
    <div
      ref={ref}
      id={id}
      className={cx(
        'grid w-full flex-shrink-0 snap-center gap-8 px-4',
        mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'
      )}
    >
      {children}
    </div>
  );
};

const kebabCase = (string: string) =>
  string
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

const chunk = (array: Array<any>, size: number) =>
  Array.from({ length: Math.ceil(array.length / size) }, (v: any, i: number) => array.slice(i * size, i * size + size));
