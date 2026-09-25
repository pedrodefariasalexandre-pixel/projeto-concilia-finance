import { useOutletContext } from 'react-router-dom';
import type { ProtectedOutletContext } from '../routes/ProtectedRoute';

export function useAuthenticatedUserId(): string {
  return useOutletContext<ProtectedOutletContext>().userId;
}
