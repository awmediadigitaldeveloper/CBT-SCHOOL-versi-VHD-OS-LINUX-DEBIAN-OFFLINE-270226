import React, { useState } from 'react';
import { ShieldCheck, Key, Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import LicenseConflictModal from './LicenseConflictModal';

interface LicenseActivationProps {
  onActivate: (key: string) => Promise<{ success: boolean; message?: string }>;
  loading: boolean;
  globalError?: string | null;
}

const LicenseActivation: React.FC<LicenseActivationProps> = ({ onActivate, loading, globalError }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDismissed(false); // Reset dismissal on new attempt
    
    if (!key.trim()) {
      setError('Masukkan kunci lisensi.');
      return;
    }

    const result = await onActivate(key);
    if (!result.success) {
      setError(result.message || 'Aktivasi gagal.');
    }
  };

  // Determine if we should show the conflict modal
  const activeError = error || (!dismissed ? globalError : null);
  const isConflict = activeError && (
    activeError.toLowerCase().includes('use') || 
    activeError.toLowerCase().includes('digunakan') || 
    activeError.toLowerCase().includes('device') ||
    activeError.toLowerCase().includes('perangkat') ||
    activeError.toLowerCase().includes('mismatch') ||
    activeError.toLowerCase().includes('hwid')
  );

  const handleCloseModal = () => {
      setError('');
      setDismissed(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <LicenseConflictModal 
        isOpen={!!isConflict} 
        onClose={handleCloseModal} 
        message={activeError || undefined}
      />

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center">
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Aktivasi CBT School</h2>
          <p className="text-blue-100 mt-2 text-sm">Masukkan lisensi resmi untuk membuka akses.</p>
        </div>

        <div className="p-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-700">
              <p className="font-bold">Mode Terkunci</p>
              <p>Aplikasi ini membutuhkan lisensi aktif. Satu lisensi hanya berlaku untuk satu sekolah/domain.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kunci Lisensi (License Key)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Memverifikasi...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Aktifkan Lisensi
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Butuh bantuan? Hubungi vendor resmi CBT School.
            </p>
            <p className="text-xs text-gray-300 mt-1 font-mono">
              HWID: {localStorage.getItem('device_hwid') || 'Generating...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicenseActivation;
