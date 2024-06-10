import { cva } from 'class-variance-authority';
import Link from 'next/link';

type NoContentProps = {
  href?: string;
  options: NoContentOptions;
  isEditing: boolean;
};

export type NoContentOptions = {
  image: string;
  color?: 'grey' | 'blue' | 'green' | 'orange' | 'purple' | 'yellow';
  browse: {
    title: string;
    description: string;
  };
  edit?: {
    title: string;
    description: string;
  };
};

export const NoContent = ({ href, options, isEditing }: NoContentProps) => {
  if (isEditing) {
    if (!href || !options.edit) return null;

    return (
      <Link href={href} className={editClassNames({ color: options.color ?? 'grey' })}>
        <div className="relative top-1.5 -mx-4 shrink-0">
          <img src={options.image} alt="" className="-my-3 h-24 w-auto object-contain" />
        </div>
        <div>
          <div className="text-smallTitle text-text">{options.edit.title}</div>
          <div className="mt-1 text-metadata text-text">{options.edit.description}</div>
        </div>
      </Link>
    );
  }

  return (
    <div className="mb-8 flex items-center gap-8 overflow-clip rounded-lg bg-grey-01 p-4">
      <div className="relative top-1.5 -mx-4 shrink-0">
        <img src={options.image} alt="" className="-my-3 h-24 w-auto object-contain" />
      </div>
      <div>
        <div className="text-smallTitle text-text">{options.browse.title}</div>
        <div className="mt-1 text-metadata text-text">{options.browse.description}</div>
      </div>
    </div>
  );
};

const editClassNames = cva('mb-8 flex items-center gap-8 overflow-clip rounded-lg p-4', {
  variants: {
    color: {
      purple: 'bg-gradient-purple',
      blue: 'bg-gradient-blue',
      yellow: 'bg-gradient-yellow',
      grey: 'bg-gradient-grey',
      green: 'bg-gradient-green',
      orange: 'bg-gradient-orange',
    },
  },
});
