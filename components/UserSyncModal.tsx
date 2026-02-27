import React, { useMemo, useState, useRef } from 'react';
import { User, ValidatedUserRow, ImportStatus, AppConfig } from '../types';
import { DEFAULT_PROFILE_IMAGES } from '../constants';
import { supabase } from '../supabaseClient';

interface UserSyncModalProps {
  existingUsers: User[];
  onClose: () => void;
  onSuccess: () => void;
  config: AppConfig;
  activeTab: 'student' | 'teacher' | 'admin';
}

const UserSyncModal: React.FC<UserSyncModalProps> = ({ existingUsers, onClose, onSuccess, config, activeTab }) => {
  const [mode, setMode] = useState<'select' | 'preview' | 'importing'>('select');
  const [importType, setImportType] = useState<'csv' | 'sheet' | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PARSING LOGIC ---
  const parseCSVContent = (text: string) => {
      const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
      if (lines.length === 0) return [];

      const firstLine = lines[0];
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const delimiter = semicolonCount > commaCount ? ';' : ',';

      return lines.map(line => {
          const regex = new RegExp(`(?:^|${delimiter})(\"(?:[^\"]+|\"\")*\"|[^${delimiter}]*)`, 'g');
          const row: string[] = [];
          let match;
          while (match = regex.exec(line)) {
              let val = match[1];
              if (val.length > 0 && val.charAt(0) === '"') {
                  val = val.substring(1, val.length - 1).replace(/""/g, '"');
              }
              row.push(val.trim());
          }
          if (row.length <= 1) {
              return line.split(delimiter).map(s => s.trim().replace(/^"|"$/g, ''));
          }
          return row;
      });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const parsedRows = parseCSVContent(text);
          setCsvData(parsedRows);
          setImportType('csv');
          setMode('preview');
      };
      reader.readAsText(file);
      e.target.value = ''; 
  };

  const handleFetchSheet = async () => {
      setIsFetchingSheet(true);
      setError('');
      try {
          if (!sheetUrl) {
              throw new Error("Silakan masukkan URL Google Sheet terlebih dahulu.");
          }
          const response = await fetch(sheetUrl);
          if (!response.ok) throw new Error("Gagal mengunduh data dari Google Sheet. Pastikan URL valid dan Sheet dibagikan secara publik.");
          
          const text = await response.text();
          const parsedRows = parseCSVContent(text);
          setCsvData(parsedRows);
          setImportType('sheet');
          setMode('preview');
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsFetchingSheet(false);
      }
  };

  // --- VALIDATION LOGIC ---
  const { validatedData, headerError } = useMemo<{ validatedData: ValidatedUserRow[], headerError: string | null }>(() => {
    if (mode !== 'preview') return { validatedData: [], headerError: null };
    if (csvData.length === 0) return { validatedData: [], headerError: "Data kosong." };
    
    const contentRows = csvData.filter(row => row.length > 0 && !row[0].trim().startsWith('#'));
    if (contentRows.length < 2) return { validatedData: [], headerError: "File tidak berisi data atau format salah." };

    const headerRow = contentRows[0];
    const cleanedHeader = headerRow.map((h, index) => {
        let clean = h.trim();
        if (index === 0) clean = clean.replace(/^\uFEFF/, '');
        return clean.toLowerCase();
    });

    const requiredColumns = ['fullname', 'nisn', 'class', 'major', 'gender'];
    const columnMap: { [key: string]: number } = {};
    
    cleanedHeader.forEach((col, index) => {
        if (col === 'username' || col === 'email') columnMap['username'] = index;
        else if (col === 'password' || col === 'pass') columnMap['password'] = index;
        else if (col === 'fullname' || col === 'nama lengkap' || col === 'full_name' || col === 'nama') columnMap['fullname'] = index;
        else if (col === 'nisn') columnMap['nisn'] = index;
        else if (col === 'class' || col === 'kelas') columnMap['class'] = index;
        else if (col === 'major' || col === 'jurusan') columnMap['major'] = index;
        else if (col === 'gender' || col === 'jenis kelamin' || col === 'jk') columnMap['gender'] = index;
        else if (col === 'religion' || col === 'agama') columnMap['religion'] = index;
        else if (col === 'photourl' || col === 'photo_url' || col === 'url_foto' || col === 'foto' || col === 'photo') columnMap['photoUrl'] = index;
        else if (col === 'role') columnMap['role'] = index;
    });

    const missingColumns = requiredColumns.filter(col => columnMap[col] === undefined);
    if (missingColumns.length > 0) {
      return { validatedData: [], headerError: `Header tidak valid. Kolom berikut tidak ditemukan: ${missingColumns.join(', ')}.` };
    }

    const dataRows = contentRows.slice(1);
    const existingUsernamesClean = new Set(existingUsers.map(u => u.username.toLowerCase()));
    const usernamesInFileClean = new Set<string>();
    
    const validatedRows = dataRows.map((row, index): ValidatedUserRow => {
      const rowNumber = index + 2;

      let username = row[columnMap['username']]?.trim();
      const password = columnMap['password'] !== undefined ? row[columnMap['password']]?.trim() : undefined;
      const fullName = row[columnMap['fullname']]?.trim();
      const nisn = row[columnMap['nisn']]?.trim();
      const className = row[columnMap['class']]?.trim();
      const major = row[columnMap['major']]?.trim();
      const genderRaw = row[columnMap['gender']]?.trim();
      const religion = columnMap['religion'] !== undefined ? row[columnMap['religion']]?.trim() : 'Islam';
      let photoUrl = columnMap['photoUrl'] !== undefined ? row[columnMap['photoUrl']]?.trim() : undefined;
      let roleRaw = columnMap['role'] !== undefined ? row[columnMap['role']]?.trim() : undefined;

      if (!username && nisn) username = nisn;
      if (username && /^\d+$/.test(username)) username = `${username}@${config.emailDomain}`;

      if (!username || !fullName || !nisn || !className || !major || !genderRaw) {
        return { rowNumber, status: ImportStatus.INVALID_MISSING_FIELDS, message: 'Kolom wajib tidak boleh kosong.' };
      }
      
      let gender: 'Laki-laki' | 'Perempuan';
      const genderLower = genderRaw.toLowerCase();
      if (genderLower === 'l' || genderLower === 'laki-laki' || genderLower === 'laki') gender = 'Laki-laki';
      else if (genderLower === 'p' || genderLower === 'perempuan') gender = 'Perempuan';
      else return { rowNumber, username, status: ImportStatus.INVALID_MISSING_FIELDS, message: "Gender harus L/P." };
      
      if (!photoUrl) {
          photoUrl = gender === 'Laki-laki' ? DEFAULT_PROFILE_IMAGES.STUDENT_MALE : DEFAULT_PROFILE_IMAGES.STUDENT_FEMALE;
      }

      // Role Logic
      let finalRole = roleRaw || 'student';
      if (activeTab === 'teacher') finalRole = 'teacher';
      else if (activeTab === 'admin') finalRole = 'admin';
      if (className.toUpperCase().includes('STAFF') || className.toUpperCase().includes('GURU')) finalRole = 'teacher';
      
      const cleanUsername = username.toLowerCase();
      if (usernamesInFileClean.has(cleanUsername)) {
        return { username, rowNumber, status: ImportStatus.INVALID_DUPLICATE_IN_FILE, message: 'Username duplikat di file.' };
      }
      usernamesInFileClean.add(cleanUsername);
      
      const userObject = { username, password: password || nisn, fullName, nisn, class: className, major, gender, religion, photoUrl, role: finalRole };
      const isUpdating = existingUsernamesClean.has(cleanUsername);

      if (isUpdating) return { ...userObject, rowNumber, status: ImportStatus.VALID_UPDATE, message: 'Akan diperbarui.' };
      return { ...userObject, rowNumber, status: ImportStatus.VALID_NEW, message: 'Akan ditambahkan.' };
    });

    return { validatedData: validatedRows, headerError: null };
  }, [csvData, existingUsers, config.emailDomain, mode, activeTab]);

  const summary = useMemo(() => {
    return validatedData.reduce((acc, row) => {
        if (row.status === ImportStatus.VALID_NEW) acc.new++;
        else if (row.status === ImportStatus.VALID_UPDATE) acc.update++;
        else acc.error++;
        return acc;
    }, { new: 0, update: 0, error: 0 });
  }, [validatedData]);
  
  const errorRows = useMemo(() => validatedData.filter(row => row.status >= ImportStatus.INVALID_DUPLICATE_IN_FILE), [validatedData]);

  const handleConfirm = async () => {
    setMode('importing');
    const validRows = validatedData.filter(row => row.status === ImportStatus.VALID_NEW || row.status === ImportStatus.VALID_UPDATE);
    
    try {
        if (importType === 'sheet') {
            // Sheet Sync uses sync_all_users (deletes missing)
            const { data, error } = await supabase.rpc('sync_all_users', { users_data: validRows });
            if (error) throw error;
            alert(`Sinkronisasi selesai: ${data.inserted} ditambah, ${data.updated} diperbarui, ${data.deleted} dihapus.`);
        } else {
            // CSV Import uses admin_import_users (upsert only)
            const { error } = await supabase.rpc('admin_import_users', { users_data: validRows });
            if (error) throw error;
            alert(`Berhasil mengimpor ${validRows.length} pengguna!`);
        }
        onSuccess();
        onClose();
    } catch (err: any) {
        alert(`Gagal: ${err.message}`);
        setMode('preview');
    }
  };

  const getStatusChip = (status: ImportStatus) => {
      switch(status) {
          case ImportStatus.VALID_NEW: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Baru</span>;
          case ImportStatus.VALID_UPDATE: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Update</span>;
          default: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Error</span>;
      }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform animate-scale-up overflow-hidden">
        
        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-xl font-bold text-gray-800">
                {mode === 'select' ? 'Import & Sinkronisasi Pengguna' : 'Pratinjau Data'}
            </h3>
            <p className="text-sm text-gray-500">
                {mode === 'select' ? 'Pilih metode untuk menambahkan data secara massal.' : `Metode: ${importType === 'sheet' ? 'Sinkronisasi Google Sheet' : 'Upload CSV'}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-full p-2 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 flex-grow overflow-y-auto">
          {mode === 'select' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Option 1: CSV */}
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                      <div className="bg-blue-100 text-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      </div>
                      <h4 className="text-lg font-bold text-gray-800 mb-2">Upload File CSV</h4>
                      <p className="text-sm text-gray-500 mb-4">Tambahkan atau perbarui data menggunakan file CSV. Data yang sudah ada tidak akan dihapus.</p>
                      <span className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm">Pilih File</span>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                  </div>

                  {/* Option 2: Google Sheet */}
                  <div className="border-2 border-gray-200 rounded-xl p-8 text-center hover:border-emerald-500 transition-all flex flex-col justify-between">
                      <div>
                          <div className="bg-emerald-100 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          </div>
                          <h4 className="text-lg font-bold text-gray-800 mb-2">Sinkronisasi Google Sheet</h4>
                          <p className="text-sm text-gray-500 mb-4">Tarik data langsung dari URL Google Sheet. <strong className="text-red-500">Perhatian: Data siswa yang tidak ada di Sheet akan dihapus!</strong></p>
                          
                          <input 
                              type="url" 
                              value={sheetUrl}
                              onChange={(e) => setSheetUrl(e.target.value)}
                              placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                              className="w-full p-2 border border-gray-300 rounded-md mb-4 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          />
                      </div>
                      
                      {error && <div className="text-red-600 text-xs mb-4 bg-red-50 p-2 rounded">{error}</div>}
                      
                      <button 
                          onClick={handleFetchSheet}
                          disabled={isFetchingSheet || !sheetUrl}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                          {isFetchingSheet ? (
                              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Menarik Data...</>
                          ) : 'Mulai Sinkronisasi'}
                      </button>
                  </div>
              </div>
          )}

          {mode === 'preview' && (
            <>
                {headerError ? (
                    <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-md">{headerError}</div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                            <div className="bg-blue-50 p-3 rounded-lg"><span className="font-bold text-blue-700">{summary.new}</span> Data Baru</div>
                            <div className="bg-yellow-50 p-3 rounded-lg"><span className="font-bold text-yellow-700">{summary.update}</span> Data Update</div>
                            <div className="bg-red-50 p-3 rounded-lg"><span className="font-bold text-red-700">{summary.error}</span> Data Error</div>
                        </div>

                        {summary.error > 0 && (
                        <div className="mt-4 mb-6">
                            <h4 className="font-semibold text-red-700">Detail Error ({summary.error} baris):</h4>
                            <div className="border border-red-200 rounded-lg max-h-40 overflow-y-auto bg-red-50 mt-2">
                                <table className="min-w-full divide-y divide-red-200 text-sm">
                                    <thead className="bg-red-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium text-red-800">Baris #</th>
                                            <th className="px-4 py-2 text-left font-medium text-red-800">Username</th>
                                            <th className="px-4 py-2 text-left font-medium text-red-800">Pesan Error</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {errorRows.map((row, index) => (
                                            <tr key={index}>
                                                <td className="px-4 py-2 font-mono">{row.rowNumber}</td>
                                                <td className="px-4 py-2 font-mono">{row.username || '(kosong)'}</td>
                                                <td className="px-4 py-2 text-red-700 font-medium">{row.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        )}

                        {summary.error === 0 && (
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                                    <th className="px-4 py-2 text-left font-medium text-gray-500">Username</th>
                                    <th className="px-4 py-2 text-left font-medium text-gray-500">Nama Lengkap</th>
                                    <th className="px-4 py-2 text-left font-medium text-gray-500">Kelas</th>
                                </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                {validatedData.slice(0, 100).map((row, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-2">{getStatusChip(row.status)}</td>
                                        <td className="px-4 py-2 font-mono">{row.username || '-'}</td>
                                        <td className="px-4 py-2">{row.fullName || '-'}</td>
                                        <td className="px-4 py-2">{row.class || '-'}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                            {validatedData.length > 100 && (
                                <div className="text-center py-3 text-gray-500 text-sm bg-gray-50 border-t">
                                    Menampilkan 100 dari {validatedData.length} data...
                                </div>
                            )}
                        </div>
                        )}
                    </>
                )}
            </>
          )}

          {mode === 'importing' && (
              <div className="flex flex-col items-center justify-center py-20">
                  <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <h3 className="text-xl font-bold text-gray-800">Memproses Data...</h3>
                  <p className="text-gray-500 mt-2">Mohon tunggu, jangan tutup jendela ini.</p>
              </div>
          )}
        </div>
        
        <div className="p-5 border-t flex justify-between items-center bg-gray-50 rounded-b-2xl">
          {mode === 'preview' ? (
              <button type="button" onClick={() => setMode('select')} className="text-gray-600 hover:text-gray-900 font-semibold flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                  Kembali
              </button>
          ) : <div></div>}
          
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={mode === 'importing'} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg disabled:opacity-50">Batal</button>
            {mode === 'preview' && (
                <button 
                    type="button" 
                    onClick={handleConfirm}
                    disabled={!!headerError || summary.error > 0 || (summary.new + summary.update === 0)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Konfirmasi & {importType === 'sheet' ? 'Sinkronisasi' : 'Impor'} {summary.new + summary.update} Data
                </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSyncModal;
