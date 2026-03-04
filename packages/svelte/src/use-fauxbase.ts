import { getFauxbaseContext } from './context';

export function useFauxbase() {
  const ctx = getFauxbaseContext();
  return ctx.client;
}
