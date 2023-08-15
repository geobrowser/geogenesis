import { TypedUseSelectorHook, useSelector } from 'react-redux';

import { RootState } from '../state/root-store';

export const useGeoSelector: TypedUseSelectorHook<RootState> = useSelector;
