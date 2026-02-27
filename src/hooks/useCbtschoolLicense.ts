import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useCallback } from 'react';
import { supabase as localSupabase } from '../../supabaseClient';

// ==============================================================================
//  LICENSE HOOK — CBT SCHOOL ENTERPRISE VHD EDITION
//
//  Model Lisensi:
//  - Aktivasi SEKALI saja saat pertama kali (butuh internet via NAT)
//  - Setelah aktivasi, aplikasi berjalan FULLY OFFLINE via LAN sekolah
//  - Lisensi di-cache di localStorage (bertahan meski offline)
//  - Re-validasi HANYA jika internet tersedia (tidak memblokir jika offline)
//  - Device lock: terikat ke hardware ID VirtualBox instance
// ==============================================================================

// --- VENDOR CONFIGURATION (Jangan diubah) ---
const VENDOR_URL = 'https://yiuamqcfgdgcwxtrihfd.supabase.co';
const VENDOR_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdWFtcWNmZ2RnY3d4dHJpaGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTU5MDUsImV4cCI6MjA4MTQzMTkwNX0.tRUkfK3cx2Cpwqv14ZXYoUpwwpi_hDhl90EfARAA_IA';
const APP_ID     = 'cbtschool';

// Timeout untuk request vendor (agar tidak hang terlalu lama)
const VENDOR_TIMEOUT_MS = 8000;

const vendorSupabase = createClient(VENDOR_URL, VENDOR_KEY, {
  auth: { persistSession: false },
});

// ==============================================================================
//  HELPERS
// ==============================================================================

/**
 * Hardware ID: unik per VirtualBox instance.
 * Disimpan di localStorage — bertahan selama VM tidak di-reset.
 */
const getHardwareId = (): string => {
  let hwid = localStorage.getItem('device_hwid');
  if (!hwid) {
    // Generate ID unik berbasis timestamp + random
    hwid = 'VHD-' + Date.now().toString(36).toUpperCase() + '-'
         + Math.random().toString(36).substr(2, 8).toUpperCase();
    localStorage.setItem('device_hwid', hwid);
  }
  return hwid;
};

/**
 * Cek apakah internet tersedia sebelum ping ke vendor.
 * Menggunakan navigator.onLine sebagai first gate.
 */
const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Wrap promise dengan timeout agar tidak hang jika jaringan lambat.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), ms)
  );
  return Promise.race([promise, timeout]);
};

// ==============================================================================
//  HOOK
// ==============================================================================

export const useCbtschoolLicense = () => {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [profile, setProfile] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('cbtschool_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading]           = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  //  VALIDATE LICENSE
  //  Hanya dijalankan jika internet tersedia.
  //  Jika offline → pakai cached license, jangan lock.
  // --------------------------------------------------------------------------
  const validateLicense = useCallback(async () => {
    const key  = localStorage.getItem('cbtschool_key');
    const hwid = getHardwareId();

    // Tidak ada key → lock
    if (!key) {
      if (!isLocked) setIsLocked(true);
      return;
    }

    // === GUARD: Jangan ping vendor jika offline ===
    // Ini krusial untuk VHD: saat ujian berlangsung (offline),
    // jangan sampai license check memblokir atau throw error.
    if (!isOnline()) {
      console.log('[License] Offline — menggunakan cached license. Aplikasi tetap berjalan.');
      // Pastikan tidak terkunci jika sebelumnya sudah aktif
      const cachedProfile = localStorage.getItem('cbtschool_profile');
      if (cachedProfile && isLocked) {
        setIsLocked(false);
      }
      return;
    }

    // === Online: Re-validasi ke vendor ===
    try {
      const currentDomain = window.location.hostname;

      const { data, error } = await withTimeout(
        vendorSupabase.rpc('verify_client_license', {
          input_key:    key,
          input_hw_id:  hwid,
          input_app_id: APP_ID,
          input_domain: currentDomain,
        }),
        VENDOR_TIMEOUT_MS
      );

      if (error) throw error;

      if (data?.success) {
        // Lisensi valid
        if (isLocked) setIsLocked(false);
        setLicenseError(null);

        // Update profile jika ada perubahan
        const newProfileStr = JSON.stringify(data.data.owner);
        const oldProfileStr = localStorage.getItem('cbtschool_profile');

        if (newProfileStr !== oldProfileStr) {
          setProfile(data.data.owner);
          localStorage.setItem('cbtschool_profile', newProfileStr);
          // Sync ke local DB di background (fire & forget)
          syncLicenseToLocal(key, data.data.owner, hwid, data.data).catch(console.error);
        }

      } else {
        // Lisensi dicabut / invalid oleh vendor
        console.warn('[License] Dicabut oleh vendor. Mengunci aplikasi...');
        setLicenseError(data?.message || 'Lisensi tidak valid atau digunakan di perangkat lain.');
        localStorage.removeItem('cbtschool_key');
        localStorage.removeItem('cbtschool_profile');
        setIsLocked(true);
        setProfile(null);
        await resetLocalConfig();
      }

    } catch (err: any) {
      // Error jaringan → jangan lock, biarkan offline mode aktif
      if (
        err.message?.includes('fetch')   ||
        err.message?.includes('Network') ||
        err.message?.includes('timeout') ||
        err.message?.includes('Failed')
      ) {
        console.log('[License] Jaringan tidak tersedia. Offline mode aktif, lisensi cached tetap berlaku.');
      } else {
        console.error('[License] Validation error:', err.message);
      }
    }
  }, [isLocked]);

  // --------------------------------------------------------------------------
  //  EFFECTS
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Validasi saat pertama kali load
    validateLicense();

    const handleLicenseChange = () => {
      const key = localStorage.getItem('cbtschool_key');
      if (key) {
        setIsLocked(false); // Optimistic unlock
        try {
          const stored = localStorage.getItem('cbtschool_profile');
          if (stored) setProfile(JSON.parse(stored));
        } catch {}
      } else {
        setIsLocked(true);
        setProfile(null);
      }
      // Re-verify hanya jika online
      if (isOnline()) validateLicense();
    };

    // Re-validasi saat window dapat fokus HANYA jika online
    // (misal: admin buka tab lain lalu kembali ke CBT)
    const handleFocus = () => {
      if (isOnline()) {
        validateLicense();
      }
    };

    // ✅ TIDAK ada setInterval — model "aktivasi sekali" tidak perlu periodic check.
    // Re-validasi hanya terjadi:
    // 1. Saat app pertama load
    // 2. Saat window focus (dan online)
    // 3. Saat event 'cbtschool-license-changed' (aktivasi/reset manual)

    window.addEventListener('focus', handleFocus);
    window.addEventListener('cbtschool-license-changed', handleLicenseChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('cbtschool-license-changed', handleLicenseChange);
    };
  }, [validateLicense]);

  // --------------------------------------------------------------------------
  //  RESET LOCAL CONFIG (saat lisensi dicabut)
  // --------------------------------------------------------------------------
  const resetLocalConfig = async () => {
    try {
      await localSupabase.from('app_config').update({
        school_name: 'SEKOLAH KITA BISA BERKARYA',
        logo_url:    'https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg',
        left_logo_url: '',
        school_domain: null,
        npsn:          null,
      }).eq('id', 1);
    } catch (err) {
      console.error('[License] Gagal reset config:', err);
    }
  };

  // --------------------------------------------------------------------------
  //  SYNC LICENSE TO LOCAL DB
  // --------------------------------------------------------------------------
  const syncLicenseToLocal = async (
    key: string,
    owner: any,
    hwid: string,
    fullData: any
  ) => {
    try {
      console.log('[LicenseSync] Sinkronisasi data lisensi untuk:', owner.school_name);

      const { error } = await localSupabase.rpc('sync_license_data', {
        p_license_key: key,
        p_school_name: owner.school_name,
        p_npsn:        owner.npsn,
        p_hwid:        hwid,
        p_json_data:   fullData,
      });

      if (error) {
        if (
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('NetworkError')
        ) {
          console.warn('[LicenseSync] Jaringan tidak tersedia. Sync dilewati.');
        } else {
          console.warn('[LicenseSync] RPC Error:', error.message);
        }
      } else {
        console.log('[LicenseSync] Konfigurasi berhasil diperbarui.');
      }
    } catch (err) {
      console.error('[LicenseSync] Exception:', err);
    }
  };

  // --------------------------------------------------------------------------
  //  MANUAL ACTIVATION
  //  Dipanggil saat admin input license key untuk pertama kali.
  //  Butuh internet (via NAT adapter).
  // --------------------------------------------------------------------------
  const activate = async (licenseKey: string) => {
    setLoading(true);

    // Guard: Aktivasi butuh internet
    if (!isOnline()) {
      setLoading(false);
      return {
        success: false,
        message: 'Aktivasi lisensi membutuhkan koneksi internet. Pastikan VirtualBox NAT adapter aktif dan internet tersedia.',
      };
    }

    try {
      const hwid          = getHardwareId();
      const currentDomain = window.location.hostname;

      const { data, error } = await withTimeout(
        vendorSupabase.rpc('verify_client_license', {
          input_key:    licenseKey,
          input_hw_id:  hwid,
          input_app_id: APP_ID,
          input_domain: currentDomain,
        }),
        VENDOR_TIMEOUT_MS
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Lisensi tidak valid.');

      // Aktivasi berhasil — simpan ke cache
      localStorage.setItem('cbtschool_key',     licenseKey);
      localStorage.setItem('cbtschool_profile', JSON.stringify(data.data.owner));

      setIsLocked(false);
      setProfile(data.data.owner);
      setLicenseError(null);

      // Notifikasi komponen lain
      window.dispatchEvent(new Event('cbtschool-license-changed'));

      // Sync ke local DB di background
      syncLicenseToLocal(licenseKey, data.data.owner, hwid, data.data).catch(console.error);

      return { success: true };

    } catch (err: any) {
      const msg = err.message?.includes('timeout')
        ? 'Koneksi ke server lisensi timeout. Periksa koneksi internet VHD (NAT adapter).'
        : (err.message || 'Aktivasi gagal. Periksa kembali license key Anda.');

      setLicenseError(msg);
      return { success: false, message: msg };

    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  //  RESET LICENSE (misal: pindah ke VHD baru)
  // --------------------------------------------------------------------------
  const resetLicense = async () => {
    localStorage.removeItem('cbtschool_key');
    localStorage.removeItem('cbtschool_profile');
    setIsLocked(true);
    setProfile(null);
    setLicenseError(null);

    window.dispatchEvent(new Event('cbtschool-license-changed'));
    resetLocalConfig().catch(console.error);
    return true;
  };

  return {
    isLocked,
    profile,
    activate,
    resetLicense,
    loading,
    licenseError,
  };
};
