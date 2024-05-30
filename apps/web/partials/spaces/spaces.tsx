'use client';

type SpacesProps = {
  spaces: Array<any>;
};

export const Spaces = ({ spaces = [] }: SpacesProps) => {
  // @TODO remove console.info for spaces
  console.info('spaces:', spaces);

  return (
    <div>
      <div>spaces</div>
    </div>
  );
};
