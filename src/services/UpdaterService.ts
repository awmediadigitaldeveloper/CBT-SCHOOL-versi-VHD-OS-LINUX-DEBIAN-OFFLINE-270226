import axios from 'axios';
import semver from 'semver';
import { version as currentVersion } from '../../package.json';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://yiuamqcfgdgcwxtrihfd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdWFtcWNmZ2RnY3d4dHJpaGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTU5MDUsImV4cCI6MjA4MTQzMTkwNX0.tRUkfK3cx2Cpwqv14ZXYoUpwwpi_hDhl90EfARAA_IA';
const APP_ID = 'cbt_pro';

export interface UpdateInfo {
  id: string;
  version: string;
  download_url: string;
  release_notes?: string;
  sql_migration?: string;
  created_at: string;
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
   * Check for available updates from Supabase Vendor
   */
  public async checkUpdate(): Promise<UpdateInfo | null> {
    try {
      console.log(`[Updater] Checking for updates... Current version: ${currentVersion}`);
      
      // Query Supabase via REST API (using axios to avoid another supabase client instance)
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/app_versions`, {
        params: {
          application_id: `eq.${APP_ID}`,
          is_active: `eq.true`,
          select: '*',
          order: 'created_at.desc',
          limit: 1
        },
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      if (response.data && response.data.length > 0) {
        const latestUpdate = response.data[0] as UpdateInfo;
        
        // Compare versions using semver
        if (semver.gt(latestUpdate.version, currentVersion)) {
          console.log(`[Updater] New version found: ${latestUpdate.version}`);
          return latestUpdate;
        } else {
          console.log(`[Updater] App is up to date.`);
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Updater] Failed to check for updates:', error);
      return null;
    }
  }

  /**
   * Perform the update process (Download -> Extract -> Replace)
   * NOTE: This function requires a Node.js environment (Electron/Server).
   * It will throw an error if run in a browser.
   */
  public async performUpdate(updateInfo: UpdateInfo, onProgress?: (percent: number) => void): Promise<boolean> {
    // Check environment
    if (typeof window !== 'undefined' && !window.process?.versions?.node) {
      console.error('[Updater] performUpdate cannot run in a browser environment. It requires Node.js access (e.g. Electron).');
      throw new Error('Update otomatis hanya tersedia di aplikasi Desktop/Server (Node.js).');
    }

    try {
      console.log(`[Updater] Starting update to version ${updateInfo.version}...`);
      
      // Dynamic imports for Node.js modules to prevent browser build errors
      const fs = await import('fs');
      const path = await import('path');
      const AdmZip = (await import('adm-zip')).default;
      
      const tempDir = path.resolve('./temp_update');
      const zipPath = path.join(tempDir, 'update.zip');

      // 1. Create temp directory
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 2. Download the update file
      console.log(`[Updater] Downloading ${updateInfo.download_url}...`);
      const response = await axios({
        url: updateInfo.download_url,
        method: 'GET',
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percent);
          }
        }
      });

      // 3. Save zip file
      fs.writeFileSync(zipPath, Buffer.from(response.data));
      console.log('[Updater] Download complete.');

      // 4. Extract
      console.log('[Updater] Extracting...');
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // 5. Backup critical files (e.g., .env)
      const backupDir = path.resolve('./backup_before_update');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
      
      const criticalFiles = ['.env', 'metadata.json', 'supabaseClient.ts'];
      criticalFiles.forEach(file => {
        const src = path.resolve(file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(backupDir, file));
        }
      });

      // 6. Replace project files
      console.log('[Updater] Replacing files...');
      const items = fs.readdirSync(tempDir);
      
      for (const item of items) {
        if (item === 'update.zip') continue;
        
        const srcPath = path.join(tempDir, item);
        const destPath = path.resolve('./', item);
        
        // Skip critical files/folders that shouldn't be overwritten
        if (['.env', '.gitignore', 'node_modules', '.git'].includes(item)) {
          console.log(`[Updater] Skipping protected item: ${item}`);
          continue;
        }

        // Recursive copy
        if (fs.statSync(srcPath).isDirectory()) {
             fs.cpSync(srcPath, destPath, { recursive: true, force: true });
        } else {
             fs.copyFileSync(srcPath, destPath);
        }
      }
      
      // 7. Execute SQL Migration if any
      if (updateInfo.sql_migration) {
        console.log('[Updater] Found SQL migration. Attempting to execute...');
        try {
            // Read .env to get local DB credentials
            const envPath = path.resolve('.env');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf-8');
                const envConfig: Record<string, string> = {};
                envContent.split('\n').forEach(line => {
                    const [key, value] = line.split('=');
                    if (key && value) envConfig[key.trim()] = value.trim();
                });

                // We need a way to execute raw SQL. 
                // Since we don't have 'pg' installed, we'll try to use the supabase client if available in the environment
                // or just log the migration for manual execution.
                
                console.log('[Updater] SQL Migration Content:', updateInfo.sql_migration);
                console.log('[Updater] NOTE: Automatic SQL execution requires "pg" library or a Supabase Admin client.');
                console.log('[Updater] Please execute the migration manually if needed.');
                
                // FUTURE: Install 'pg' and use:
                // const { Client } = require('pg');
                // const client = new Client({ connectionString: envConfig.DATABASE_URL });
                // await client.connect();
                // await client.query(updateInfo.sql_migration);
                // await client.end();
            }
        } catch (err) {
            console.error('[Updater] Failed to process SQL migration:', err);
        }
      }

      // 8. Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('[Updater] Failed to clean up temp dir:', e);
      }

      console.log('[Updater] Update completed successfully.');
      return true;

    } catch (error) {
      console.error('[Updater] Update failed:', error);
      throw error;
    }
  }
}

export default UpdaterService.getInstance();
