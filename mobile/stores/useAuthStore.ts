import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabaseClient';
import { useCart } from './useCart';

export type UserRole = 'admin' | 'manager' | 'cashier';

interface AuthState {
  isLoggedIn: boolean;
  userPhone: string | null;
  userRole: UserRole;
  employeeName: string | null;
  activeBusinessId: string | null;
  activeEmployeeId: string | null;
  setActiveBusinessId: (id: string | null) => void;
  setActiveEmployeeId: (id: string | null) => void;
  loginWithEmployee: (
    phone: string,
    role: UserRole,
    employeeName: string,
    businessId: string,
    employeeId: string
  ) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      userPhone: null,
      userRole: 'admin',
      employeeName: 'Owner / Admin',
      activeBusinessId: null,
      activeEmployeeId: null,
      setActiveBusinessId: (activeBusinessId) => set({ activeBusinessId }),
      setActiveEmployeeId: (activeEmployeeId) => set({ activeEmployeeId }),
      loginWithEmployee: (phone, role, employeeName, businessId, employeeId) => {
        set({
          isLoggedIn: true,
          userPhone: phone.replace(/\s+/g, ''),
          userRole: role,
          employeeName,
          activeBusinessId: businessId,
          activeEmployeeId: employeeId,
        });
      },
      logout: () => {
        set({
          isLoggedIn: false,
          userPhone: null,
          userRole: 'admin',
          employeeName: 'Owner / Admin',
          activeBusinessId: null,
          activeEmployeeId: null,
        });
        // Local scope only. The default ('global') revokes every session of
        // this phone number, so signing out on one till killed the refresh
        // token on every other device ("Invalid Refresh Token: Refresh Token
        // Not Found") and bounced them to login.
        void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        useCart.getState().clearCart();
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
