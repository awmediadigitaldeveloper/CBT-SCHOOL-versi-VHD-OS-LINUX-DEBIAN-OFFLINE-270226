import axios from 'axios';
import semver from 'semver';
import { version as currentVersion } from '../../package.json';

// ==============================================================================
//  UPDATER SERVICE — CBT SCHOOL ENTERPRISE VHD EDITION
//
//  Fungsi:
//  - Cek versi terbaru dari vendor (butuh internet via NAT)
//  - Tampilkan notifikasi ke admin jika ada update
//  - Download & apply update (hanya di Node.js/server environment)
//
//  Catatan VHD:
//  - checkUpdate() aman dipanggil di browser (ada guard navigator.onLine)
//  - performUpdate() hanya untuk server-side / Electron, tidak bisa di browser
// ==============================================================================

const VENDOR_SUPABASE_URL = 'https://yiuamqcfgdgcwxtrihfd.supabase.co';
const VENDOR_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdWFtcWNmZ2RnY3d4dHJpaGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTU5MDUsImV4cCI6MjA4MTQzMTkwNX0.tRUkfK3cx2Cpwqv14ZXYoUpwwpi_hDhl90EfARAA_IA';
const APP_ID              = 'cbt_pro';
const CHECK_TIMEOUT_MS    = 5000;

export interface UpdateInfo {
  id:             string;
  version:        string;
  download_url:   string;
  release_notes?: string;
  sql_migration?: string;
  created_at:     string;
}

class UpdaterService {
  private static instance: UpdaterService;

  private constructor() {}

  public static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService();
    }
    return UpdaterService.instance;
  }

  /**
   * Cek apakah ada versi terbaru dari vendor.
   *
   * Guard: Hanya berjalan jika navigator.onLine === true.
   * Aman dipanggil di browser — tidak akan hang atau throw jika offline.
   *
   * @returns UpdateInfo jika ada versi baru, null jika sudah up-to-date atau offline/error.
   */
  public async checkUpdate(): Promise<UpdateInfo | null> {
    // === GUARD: Jangan cek update jika offline ===
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Updater] Offline — skip cek update.');
      return null;
    }

    try {
      console.log(`[Updater] Cek update... Versi saat ini: ${currentVersion}`);

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

      const response = await axios.get(`${VENDOR_SUPABASE_URL}/rest/v1/app_versions`, {
        params: {
          application_id: `eq.${APP_ID}`,
          is_active:       'eq.true',
          select:          '*',
          order:           'created_at.desc',
          limit:            1,
        },
        headers: {
          'apikey':        VENDOR_SUPABASE_KEY,
          'Authorization': `Bearer ${VENDOR_SUPABASE_KEY}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.data && response.data.length > 0) {
        const latest = response.data[0] as UpdateInfo;

        if (semver.gt(latest.version, currentVersion)) {
          console.log(`[Updater] Versi baru ditemukan: ${latest.version}`);
          return latest;
        } else {
          console.log(`[Updater] Aplikasi sudah versi terbaru (${currentVersion}).`);
        }
      }

      return null;

    } catch (err: any) {
      if (err.code === 'ERR_CANCELED' || err.message?.includes('abort')) {
        console.warn('[Updater] Cek update timeout. Koneksi lambat atau tidak tersedia.');
      } else if (err.message?.includes('Network') || err.message?.includes('fetch')) {
        console.warn('[Updater] Tidak ada koneksi internet untuk cek update.');
      } else {
        console.error('[Updater] Gagal cek update:', err.message);
      }
      return null;
    }
  }

  /**
   * Lakukan proses update (download, extract, replace files).
   *
   * ⚠️ PENTING: Fungsi ini HANYA bisa dijalankan di lingkungan Node.js
   * (Electron, server script), TIDAK di browser.
   *
   * Untuk VHD, update dilakukan oleh admin IT dengan cara:
   * 1. Download ZIP update dari link yang diberikan vendor
   * 2. Extract ke /opt/cbt-enterprise/frontend/
   * 3. Jalankan npm run build ulang
   * 4. Restart nginx
   *
   * Fungsi ini tetap ada untuk keperluan masa depan jika ada
   * admin panel berbasis Electron atau script Node.js.
   */
  public async performUpdate(
    updateInfo: UpdateInfo,
    onProgress?: (percent: number) => void
  ): Promise<boolean> {

    // Guard: Tidak bisa dijalankan di browser
    const isBrowser = typeof window !== 'undefined' &&
                      !(window as any).process?.versions?.node;

    if (isBrowser) {
      console.warn('[Updater] performUpdate() tidak dapat dijalankan di browser.');
      console.info('[Updater] Untuk update di VHD, ikuti langkah manual:');
      console.info('  1. Download ZIP dari:', updateInfo.download_url);
      console.info('  2. Extract ke server VHD');
      console.info('  3. Jalankan: npm run build');
      console.info('  4. Copy dist/ ke /opt/cbt-enterprise/frontend/dist/');
      console.info('  5. Reload nginx: sudo systemctl reload nginx');
      throw new Error(
        'Update otomatis hanya tersedia via script server atau Electron.\n' +
        'Silakan minta admin IT untuk melakukan update manual.'
      );
    }

    // Guard: Butuh internet untuk download
    if (!navigator.onLine) {
      throw new Error('Update membutuhkan koneksi internet.');
    }

    try {
      console.log(`[Updater] Memulai update ke versi ${updateInfo.version}...`);

      // Dynamic import Node.js modules (agar tidak crash saat bundle browser)
      const fs      = await import('fs');
      const path    = await import('path');
      const AdmZip  = (await import('adm-zip')).default;

      const tempDir = path.resolve('./temp_update');
      const zipPath = path.join(tempDir, 'update.zip');

      // 1. Buat direktori temp
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 2. Download ZIP
      console.log(`[Updater] Mengunduh dari ${updateInfo.download_url}...`);
      const response = await axios({
        url:          updateInfo.download_url,
        method:       'GET',
        responseType: 'arraybuffer',
        onDownloadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      });

      fs.writeFileSync(zipPath, Buffer.from(response.data));
      console.log('[Updater] Download selesai.');

      // 3. Extract
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // 4. Backup file kritis
      const backupDir = path.resolve('./backup_before_update');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
      const criticalFiles = ['.env', 'metadata.json'];
      criticalFiles.forEach(file => {
        const src = path.resolve(file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(backupDir, file));
        }
      });

      // 5. Replace files (skip file yang dilindungi)
      const protectedItems = ['.env', '.gitignore', 'node_modules', '.git'];
      const items          = fs.readdirSync(tempDir);

      for (const item of items) {
        if (item === 'update.zip' || protectedItems.includes(item)) {
          console.log(`[Updater] Skip: ${item}`);
          continue;
        }
        const srcPath  = path.join(tempDir, item);
        const destPath = path.resolve('./', item);

        if (fs.statSync(srcPath).isDirectory()) {
          fs.cpSync(srcPath, destPath, { recursive: true, force: true });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // 6. Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('[Updater] Gagal bersihkan temp dir:', e);
      }

      console.log(`[Updater] Update ke ${updateInfo.version} selesai.`);
      return true;

    } catch (err) {
      console.error('[Updater] Update gagal:', err);
      throw err;
    }
  }
}

export default UpdaterService.getInstance();
