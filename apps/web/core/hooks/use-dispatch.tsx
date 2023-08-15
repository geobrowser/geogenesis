import { useDispatch } from 'react-redux';

import { AppDispatch } from '../state/wip-local-store/wip-local-store';

export const useGeoDispatch = () => useDispatch<AppDispatch>();
