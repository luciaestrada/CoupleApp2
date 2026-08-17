import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';

export function useAppContext() {
  const auth = useAuth();
  const coupleState = useCouple();
  const userId = auth.user?.id ?? null;
  const partnerId =
    coupleState.couple?.members.find((memberId) => memberId !== userId) ?? null;

  return {
    session: auth.session,
    user: auth.user,
    userProfile: auth.userProfile,
    signOut: auth.signOut,
    refreshProfile: auth.refreshProfile,
    couple: coupleState.couple,
    refreshCouple: coupleState.refreshCouple,
    userId,
    partnerId,
    isPairComplete: coupleState.couple?.members.length === 2,
  };
}

export function usePairedAppContext() {
  const context = useAppContext();
  if (!context.userId || !context.couple || !context.partnerId || !context.isPairComplete) {
    throw new Error('La pantalla requiere una pareja completa.');
  }
  return context;
}
