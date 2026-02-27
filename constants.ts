// ==============================================================================
//  CONSTANTS — CBT SCHOOL ENTERPRISE VHD EDITION
//  Semua aset default menggunakan SVG inline (data URI) — 100% offline safe.
//  Tidak ada dependency ke Cloudinary, CDN, atau layanan external.
// ==============================================================================

/**
 * Generator avatar SVG sederhana untuk fallback profile image.
 * Menghasilkan data URI yang langsung bisa dipakai sebagai src img.
 * Tidak butuh internet sama sekali.
 */
const makeAvatarSvg = (bgColor: string, initial: string, iconType: 'person' | 'admin' | 'teacher' = 'person'): string => {
  // Icon path sederhana berdasarkan tipe
  const icons: Record<string, string> = {
    // Siluet orang (siswa)
    person: `
      <circle cx="50" cy="35" r="16" fill="rgba(255,255,255,0.85)"/>
      <ellipse cx="50" cy="75" rx="24" ry="16" fill="rgba(255,255,255,0.85)"/>
    `,
    // Icon bintang (admin)
    admin: `
      <text x="50" y="62" text-anchor="middle" font-size="36"
            font-family="Arial,sans-serif" fill="rgba(255,255,255,0.9)"
            font-weight="bold">${initial}</text>
    `,
    // Icon guru (letter)
    teacher: `
      <text x="50" y="62" text-anchor="middle" font-size="36"
            font-family="Arial,sans-serif" fill="rgba(255,255,255,0.9)"
            font-weight="bold">${initial}</text>
    `,
  };

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="50" fill="${bgColor}"/>
      ${icons[iconType] || icons.person}
    </svg>
  `.trim();

  return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
};

/**
 * Default profile images — semua SVG inline, 100% offline.
 *
 * Catatan: Jika sekolah upload foto via admin dashboard,
 * foto tersebut disimpan di Supabase Storage (self-hosted di VHD)
 * dan tetap tersedia offline via LAN.
 */
export const DEFAULT_PROFILE_IMAGES = {
  // Admin — biru tua dengan initial "A"
  ADMIN: makeAvatarSvg('#1e40af', 'A', 'admin'),

  // Siswa Laki-laki — biru muda dengan siluet
  STUDENT_MALE: makeAvatarSvg('#2563eb', 'L', 'person'),

  // Siswa Perempuan — merah muda dengan siluet
  STUDENT_FEMALE: makeAvatarSvg('#db2777', 'P', 'person'),

  // Siswa Netral / Default — abu-abu dengan siluet
  STUDENT_NEUTRAL: makeAvatarSvg('#6b7280', 'S', 'person'),

  // Guru — ungu dengan initial "G"
  TEACHER: makeAvatarSvg('#7c3aed', 'G', 'teacher'),
};

// ==============================================================================
//  EXAM EVENT TYPES
// ==============================================================================

export const EXAM_EVENT_TYPES = [
  'Penilaian Sumatif Tengah Semester Gasal',
  'Penilaian Sumatif Tengah Semester Genap',
  'Penilaian Sumatif Akhir Semester Gasal',
  'Penilaian Sumatif Akhir Tahun',
  'Penilaian Sumatif Akhir Jenjang',
  'Placement Test',
  'Ujian Sekolah',
  'Asesmen Madrasah',
  'Try Out Ujian Nasional',
  'Ujian Susulan',
];

// ==============================================================================
//  PAPER SIZES
// ==============================================================================

export const PAPER_SIZES = ['A4', 'F4', 'Letter'];

// ==============================================================================
//  DISTRICTS / KABUPATEN
// ==============================================================================

export const DISTRICT_TYPES = ['KABUPATEN', 'KOTA'];

// ==============================================================================
//  QUESTION TYPES (Label untuk UI)
// ==============================================================================

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice:         'Pilihan Ganda',
  complex_multiple_choice: 'Pilihan Ganda Kompleks',
  matching:                'Menjodohkan',
  essay:                   'Uraian / Essay',
  true_false:              'Benar / Salah',
};

// ==============================================================================
//  DIFFICULTY LEVELS
// ==============================================================================

export const DIFFICULTY_LABELS: Record<string, string> = {
  Easy:   'Mudah',
  Medium: 'Sedang',
  Hard:   'Sulit',
};

export const COGNITIVE_LEVEL_LABELS: Record<string, string> = {
  L1: 'L1 — Pengetahuan & Pemahaman',
  L2: 'L2 — Aplikasi',
  L3: 'L3 — Penalaran',
};

// ==============================================================================
//  APP META
// ==============================================================================

export const APP_VERSION  = '4.0.0';
export const APP_NAME     = 'CBT School Enterprise';
export const APP_EDITION  = 'VHD Offline Edition 2026';
