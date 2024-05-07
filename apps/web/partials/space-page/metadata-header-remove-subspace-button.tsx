'use client';

export function RemoveSubspaceButton() {
  console.log('rendering');
  return (
    <button
      className="flex w-full items-center bg-white px-3 py-2 text-grey-04 hover:bg-bg hover:text-text"
      onClick={undefined}
    >
      <p className="text-button">Remove subspace</p>
    </button>
  );
}
