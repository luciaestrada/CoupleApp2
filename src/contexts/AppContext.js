import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';

export function useAppContext() {
  const auth = useAuth();
  const coupleState = useCouple();
  const userId = auth.user?.id || null;
  const partnerId =
    coupleState.couple?.members?.find((memberId) => memberId !== userId) || null;

  return {
    ...auth,
    ...coupleState,
    userId,
    partnerId,
  };
}
