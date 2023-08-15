import { useDispatch } from 'react-redux';

import { AppDispatch } from '../state/root-store';

export const useGeoDispatch = () => useDispatch<AppDispatch>();
