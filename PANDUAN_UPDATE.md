# 📋 PANDUAN APPLY UPDATE — CBT SCHOOL ENTERPRISE VHD
**Versi Fix: 2026.3 | Tanggal: 27 Februari 2026**

---

## 🗂️ FILE YANG DIUPDATE

| File | Lokasi di Project | Perubahan |
|---|---|---|
| `supabaseClient.ts` | Root | Auto-detect VHD/Cloud/Dev mode |
| `index.html` | Root | Hapus CDN, bersih untuk Vite build |
| `constants.ts` | Root | Foto default → SVG offline (tanpa Cloudinary) |
| `useCbtschoolLicense.ts` | `src/hooks/` | Hapus periodic interval, tambah `navigator.onLine` guard |
| `UpdaterService.ts` | `src/services/` | Guard offline, browser safety |
| `vite.config.ts` | Root | Chunk splitting, optimasi build |
| `package.json` | Root | Tambah Tailwind, html5-qrcode |
| `tailwind.config.js` | Root | **BARU** — konfigurasi Tailwind via npm |
| `postcss.config.js` | Root | **BARU** — PostCSS untuk Tailwind |
| `index.css` | Root | **BARU** — Tailwind directives |

---

## 🚀 LANGKAH APPLY (Jalankan di terminal project)

### Step 1 — Backup project asli
```bash
cp -r /path/to/cbt-project /path/to/cbt-project-backup-$(date +%Y%m%d)
```

### Step 2 — Copy semua file yang diupdate
```bash
# Dari folder cbt-fixed/ ke root project Anda
cp supabaseClient.ts    /path/to/project/
cp index.html           /path/to/project/
cp constants.ts         /path/to/project/
cp vite.config.ts       /path/to/project/
cp package.json         /path/to/project/
cp tailwind.config.js   /path/to/project/
cp postcss.config.js    /path/to/project/
cp index.css            /path/to/project/

# File di dalam src/
cp src/hooks/useCbtschoolLicense.ts  /path/to/project/src/hooks/
cp src/services/UpdaterService.ts    /path/to/project/src/services/
```

### Step 3 — Update index.tsx (tambahkan import CSS)
Buka file `index.tsx` dan pastikan ada import CSS di paling atas:
```typescript
import './index.css';  // ← Tambahkan baris ini jika belum ada
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// ...
```

### Step 4 — Install dependencies baru
```bash
npm install
# atau jika ada konflik:
npm install --legacy-peer-deps
```

### Step 5 — Test di mode development (cloud)
```bash
npm run dev
# Buka http://localhost:3000
# Pastikan login dan fitur utama berjalan normal
```

### Step 6 — Build production
```bash
npm run build
# Output ada di folder dist/
```

### Step 7 — Verifikasi build
```bash
# Pastikan dist/ berisi semua file yang dibutuhkan
ls -la dist/
ls -la dist/assets/

# Tidak boleh ada dependency ke CDN eksternal
# Semua JS/CSS sudah terbundle di dist/assets/
```

---

## 🖥️ DEPLOY KE VHD DEBIAN

```bash
# 1. Copy dist/ ke server VHD
scp -r dist/ user@VHD_IP:/opt/cbt-enterprise/frontend/

# 2. Set permission
sudo chown -R www-data:www-data /opt/cbt-enterprise/frontend/dist/

# 3. Reload nginx
sudo systemctl reload nginx

# 4. Test dari laptop siswa (via IP LAN Bridge)
# Buka browser: http://192.168.x.x (IP Bridge VHD)
```

---

## ✅ CHECKLIST SEBELUM GO-LIVE

```
[ ] npm run build berhasil tanpa error
[ ] dist/ ada di server VHD
[ ] Nginx berjalan dengan nginx_vhd.conf
[ ] Supabase Docker stack running (docker compose ps)
[ ] Test login admin dari localhost VHD
[ ] Test login siswa dari laptop via IP LAN
[ ] Test aktivasi lisensi (pastikan internet NAT aktif)
[ ] Putus internet → test ujian tetap bisa berjalan via LAN
[ ] Verifikasi foto default muncul (bukan broken image)
```

---

## 🔧 KONFIGURASI .env UNTUK VHD

```env
# Untuk testing CLOUD (sebelum pindah ke VHD):
VITE_SUPABASE_URL=https://sgiqmycaokirvchcqhzp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Untuk PRODUCTION VHD (setelah self-hosted Supabase running):
# VITE_SUPABASE_URL tidak diperlukan — auto-detect dari IP LAN
# Tapi tetap isi sebagai fallback:
VITE_SUPABASE_URL=http://192.168.1.100:8000
VITE_SUPABASE_ANON_KEY=your-self-hosted-anon-key
```

---

## ❓ FAQ

**Q: Tailwind class tidak muncul setelah build?**
A: Pastikan `tailwind.config.js` sudah benar content path-nya dan `index.css` diimport di `index.tsx`.

**Q: Foto profil tidak muncul (broken image)?**
A: File `constants.ts` sudah fix menggunakan SVG inline. Tidak perlu koneksi internet.

**Q: Lisensi tidak bisa diaktivasi?**
A: Pastikan Adapter 1 NAT di VirtualBox aktif dan internet tersedia. Coba `ping 8.8.8.8` dari dalam VM.

**Q: Siswa tidak bisa akses dari laptop?**
A: Pastikan Adapter 2 Bridge aktif dan IP Bridge sudah terdeteksi. Coba `ip addr show eth1` di VM.
