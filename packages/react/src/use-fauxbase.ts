import { useFauxbaseContext } from './context';

export function useFauxbase() {
  const ctx = useFauxbaseContext();
  return ctx.client;
}
