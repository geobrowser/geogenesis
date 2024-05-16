import { v4 } from 'uuid';

export function createGeoId() {
  return v4().split('-').join('');
}
