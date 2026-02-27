import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { supabase as localSupabase } from '../../supabaseClient'; // Local DB

// --- VENDOR CONFIGURATION ---
const VENDOR_URL = 'https://yiuamqcfgdgcwxtrihfd.supabase.co';
const VENDOR_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdWFtcWNmZ2RnY3d4dHJpaGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTU5MDUsImV4cCI6MjA4MTQzMTkwNX0.tRUkfK3cx2Cpwqv14ZXYoUpwwpi_hDhl90EfARAA_IA';
const APP_ID = 'cbtschool';

const vendorSupabase = createClient(VENDOR_URL, VENDOR_KEY, {
  auth: {
    persistSession: false // Vendor session doesn't need persistence in local app
  }
});

export const useCbtschoolLicense = () => {
  const [isLocked, setIsLocked] = useState<boolean>(false); // DEFAULT: UNLOCKED (Sesuai Preview AI Studio)
  const [profile, setProfile] = useState<any>(() => {
      try { 
          const stored = localStorage.getItem('cbtschool_profile');
          return stored ? JSON.parse(stored) : null;
      } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const getHardwareId = () => {
      let hwid = localStorage.getItem('device_hwid');
      if(!hwid) {
          hwid = 'BROWSER-' + Math.random().toString(36).substr(2, 9).toUpperCase();
          localStorage.setItem('device_hwid', hwid);
      }
      return hwid;
  };

  // 1. Silent Background Check & Auto-Validation
  const validateLicense = async () => {
       const key = localStorage.getItem('cbtschool_key');
       const hwid = getHardwareId();
       const currentDomain = window.location.hostname;
       
       if(!key) {
           if (!isLocked) setIsLocked(true);
           return;
       }
       
       try {
         const { data, error } = await vendorSupabase.rpc('verify_client_license', {
            input_key: key,
            input_hw_id: hwid,
            input_app_id: APP_ID,
            input_domain: currentDomain
         });
         
         if(error) throw error;

         if(data?.success) {
            // License Valid
            if (isLocked) setIsLocked(false);
            setLicenseError(null);
            
            // Update Profile if changed
            const newProfileStr = JSON.stringify(data.data.owner);
            const oldProfileStr = localStorage.getItem('cbtschool_profile');
            
            if (newProfileStr !== oldProfileStr) {
                setProfile(data.data.owner);
                localStorage.setItem('cbtschool_profile', newProfileStr);
                syncLicenseToLocal(key, data.data.owner, hwid, data.data);
            }
         } else {
            // License Invalid / Revoked / Reset at Vendor
            console.warn("[License] Revoked by vendor. Locking app...");
            setLicenseError(data.message || "Lisensi tidak valid atau digunakan di perangkat lain.");
            
            // Perform Lock
            localStorage.removeItem('cbtschool_key');
            localStorage.removeItem('cbtschool_profile');
            setIsLocked(true);
            setProfile(null);
            await resetLocalConfig();
         }
       } catch(e: any) { 
           // Network Error: Keep Offline Mode (Don't lock if just offline)
           if (e.message && (e.message.includes('fetch') || e.message.includes('Network'))) {
               console.log("[License] Offline mode active. Using cached license.");
           } else {
               console.error("[License] Validation error:", e);
           }
       }
  };

  useEffect(() => {
    // Helper to handle external license changes (optimistic update)
    const handleLicenseChange = () => {
        const key = localStorage.getItem('cbtschool_key');
        if (key) {
            setIsLocked(false); // Optimistic unlock
            try {
                const storedProfile = localStorage.getItem('cbtschool_profile');
                if (storedProfile) setProfile(JSON.parse(storedProfile));
            } catch {}
        } else {
            setIsLocked(true);
            setProfile(null);
        }
        validateLicense(); // Re-verify in background
    };

    validateLicense();
    
    // Auto-revalidate when window regains focus (e.g. user switches tabs)
    window.addEventListener('focus', validateLicense);
    
    // Listen for custom event to sync state across components (e.g. AdminDashboard -> App)
    window.addEventListener('cbtschool-license-changed', handleLicenseChange);
    
    // Periodic check every 5 minutes
    const interval = setInterval(validateLicense, 5 * 60 * 1000);
    
    return () => {
        window.removeEventListener('focus', validateLicense);
        window.removeEventListener('cbtschool-license-changed', handleLicenseChange);
        clearInterval(interval);
    };
  }, []);

  const resetLocalConfig = async () => {
      try {
          await localSupabase.from('app_config').update({
              school_name: 'SEKOLAH KITA BISA BERKARYA',
              logo_url: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg',
              left_logo_url: '',
              school_domain: null,
              npsn: null
          }).eq('id', 1);
      } catch (e) {
          console.error("Failed to reset config", e);
      }
  };

  const syncLicenseToLocal = async (key: string, owner: any, hwid: string, fullData: any) => {
      try {
          console.log("[LicenseSync] Starting sync for:", owner.school_name);
          
          // Use RPC to bypass RLS and ensure atomic update
          const { error } = await localSupabase.rpc('sync_license_data', {
              p_license_key: key,
              p_school_name: owner.school_name,
              p_npsn: owner.npsn,
              p_hwid: hwid,
              p_json_data: fullData
          });

          if (error) {
              // Suppress fetch errors in offline mode to avoid alarming users
              if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                  console.warn("[LicenseSync] Network unavailable. Sync skipped.");
              } else {
                  console.warn("[LicenseSync] RPC Error:", error);
              }
          } else {
              console.log("[LicenseSync] Config updated successfully via RPC.");
          }

      } catch (e) {
          console.error("[LicenseSync] Exception:", e);
      }
  };

  // 2. Manual Activation
  const activate = async (licenseKey: string) => {
     setLoading(true);
     try {
        const hwid = getHardwareId();
        const currentDomain = window.location.hostname;

        const { data, error } = await vendorSupabase.rpc('verify_client_license', {
            input_key: licenseKey,
            input_hw_id: hwid,
            input_app_id: APP_ID,
            input_domain: currentDomain
         });

         if(error) throw error;
         if(!data.success) throw new Error(data.message);

         // Success: Save Session
         localStorage.setItem('cbtschool_key', licenseKey);
         localStorage.setItem('cbtschool_profile', JSON.stringify(data.data.owner));
         
         setIsLocked(false);
         setProfile(data.data.owner);
         setLicenseError(null);

         // Notify other components
         window.dispatchEvent(new Event('cbtschool-license-changed'));

         // FAST UX: Sync to Local DB in background (Fire & Forget)
         syncLicenseToLocal(licenseKey, data.data.owner, hwid, data.data).catch(console.error);

         return { success: true };
     } catch(err: any) {
         const msg = err.message || 'Aktivasi Gagal';
         setLicenseError(msg);
         return { success: false, message: msg };
     } finally {
         setLoading(false);
     }
  };

  const resetLicense = async () => {
      localStorage.removeItem('cbtschool_key');
      localStorage.removeItem('cbtschool_profile');
      setIsLocked(true);
      setProfile(null);
      setLicenseError(null);
      
      // Notify other components
      window.dispatchEvent(new Event('cbtschool-license-changed'));

      // FAST UX: Reset config in background
      resetLocalConfig().catch(console.error);
      return true;
  };

  return { isLocked, profile, activate, resetLicense, loading, licenseError };
};
