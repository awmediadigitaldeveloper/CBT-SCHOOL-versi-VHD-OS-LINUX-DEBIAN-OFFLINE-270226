import React from 'react';
import { ShieldAlert, MonitorX } from 'lucide-react';

interface LicenseConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

const LicenseConflictModal: React.FC<LicenseConflictModalProps> = ({ isOpen, onClose, message }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform animate-scale-up border border-red-100">
        <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
          <div className="bg-red-100 p-4 rounded-full mb-4 shadow-inner animate-pulse">
             <MonitorX className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Akses Ditolak!</h2>
          <p className="text-red-600 font-medium mt-1">Lisensi Terdeteksi Ganda</p>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
            <div className="flex items-start">
              <ShieldAlert className="w-5 h-5 text-orange-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-orange-800">Pelanggaran Keamanan Lisensi</h3>
                <p className="text-sm text-orange-700 mt-1 leading-relaxed">
                  {message || "Kode lisensi ini sudah aktif digunakan pada perangkat atau sekolah lain. Sistem keamanan kami mencegah penggunaan satu lisensi untuk banyak perangkat secara bersamaan."}
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-600 leading-relaxed text-center px-4">
            <p>
              Jika Anda baru saja memindahkan aplikasi ke server baru, harap hubungi 
              <span className="font-bold text-gray-800"> Layanan Pelanggan </span> 
              untuk melakukan reset Hardware ID (HWID).
            </p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 flex justify-center border-t border-gray-100">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Mengerti, Tutup Pesan
          </button>
        </div>
      </div>
    </div>
  );
};

export default LicenseConflictModal;
