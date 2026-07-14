import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';

const CoupleContext = createContext(null);

export function CoupleProvider({ children }) {
  const { userProfile } = useAuth();
  const [couple, setCouple] = useState(null);

  useEffect(() => {
    if (!userProfile?.coupleId) return;
    const ref = doc(db, 'couples', userProfile.coupleId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setCouple({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [userProfile?.coupleId]);

  return (
    <CoupleContext.Provider value={{ couple }}>
      {children}
    </CoupleContext.Provider>
  );
}

export const useCouple = () => useContext(CoupleContext);
