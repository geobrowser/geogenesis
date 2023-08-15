import { TypedUseSelectorHook, useSelector } from 'react-redux';

import { RootState } from '../state/wip-local-store/wip-local-store';

export const useGeoSelector: TypedUseSelectorHook<RootState> = useSelector;
