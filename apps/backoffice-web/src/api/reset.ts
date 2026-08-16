import { Type } from '@sinclair/typebox';
import { apiRequest } from './client';

/**
 * The prototype's "Reiniciar datos de prueba" button, which reset its in-browser
 * mock. `@penka/backoffice-api` registers NO seed or reset route — there is
 * nothing in the contract to call — so the button only exists when a deployment
 * names one itself, and stays hidden otherwise.
 *
 * The path is relative to the admin prefix, e.g. `/dev/seed`, so a demo
 * deployment can wire a throwaway route without this app knowing its shape:
 * whatever it answers is ignored.
 */
export const RESET_ENDPOINT = import.meta.env.VITE_ADMIN_RESET_ENDPOINT ?? '';

export const isResetAvailable = RESET_ENDPOINT !== '';

export function resetDemoData(): Promise<unknown> {
  return apiRequest(RESET_ENDPOINT, { method: 'POST', schema: Type.Unknown() });
}
