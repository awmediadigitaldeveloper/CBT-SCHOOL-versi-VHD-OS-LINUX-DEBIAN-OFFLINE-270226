
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig, User, Test, AdminView, Question, MasterData, Announcement, MasterDataItem, Schedule, ValidatedUserRow, ImportStatus, TestDetails } from '../types';
import UserManagement from '../components/UserManagement';
import ConfigurationScreen from '../components/ConfigurationScreen';
import QuestionBank from '../components/QuestionBank';
import ExamCards from '../components/ExamCards';
import DataMaster from '../components/DataMaster';
import QuestionAnalysis from '../components/QuestionAnalysis';
import GradeRecap from '../components/GradeRecap';
import Announcements from '../components/Announcements';
import UbkMonitor from '../components/UbkMonitor';
import DashboardHome from '../components/DashboardHome';
import ExamSchedule from '../components/TestManagement';
import BackupScreen from '../components/BackupScreen';
import AdminCard from '../components/AdminCard';
import ToastNotification from '../components/ToastNotification';
import BulkImportProgress from '../components/BulkImportProgress';
import RestoreProgressModal from '../components/RestoreProgressModal';
import PrintDocuments from '../components/PrintDocuments'; // Import New Component
import { DEFAULT_PROFILE_IMAGES } from '../constants';
import { useCbtschoolLicense } from '../src/hooks/useCbtschoolLicense';
import LicenseActivation from '../components/LicenseActivation';
import { Lock, ShieldCheck, AlertTriangle } from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig) => Promise<boolean>;
  setIsBatchProcessing: (isProcessing: boolean) => void;
  isLocked: boolean; // New Prop
  licenseProfile: any; // New Prop
  licenseError?: string | null; // New Prop
}

interface NavItem {
  id: AdminView;
  label: string;
  icon: React.ReactNode;
}

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
  const { user, onLogout, config, onUpdateConfig, setIsBatchProcessing, isLocked: propsIsLocked, licenseProfile: propsLicenseProfile, licenseError: propsLicenseError } = props;
  
  const [isDataLoading, setIsDataLoading] = useState(false); // Default false for instant render
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [tests, setTests] = useState<Map<string, Test>>(new Map());
  const [masterData, setMasterData] = useState<MasterData>({ classes: [], majors: [] });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [examSessions, setExamSessions] = useState<any[]>([]);
  
  const [activeView, setActiveView] = useState<AdminView>(AdminView.HOME);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [preselectedTestToken, setPreselectedTestToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error'; key: number } | null>(null);
  const [isFetchingQuestions, setIsFetchingQuestions] = useState(false);
  const [isFixingEmails, setIsFixingEmails] = useState(false);
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0, errors: [] as { user: string; message: string }[] });
  const [isImporting, setIsImporting] = useState(false);
  const [totalUserCount, setTotalUserCount] = useState(0); // New State
  const [realTeacherCount, setRealTeacherCount] = useState(0); // New State
  const [realAdminCount, setRealAdminCount] = useState(0); // New State
  const [realStudentCount, setRealStudentCount] = useState(0); // New State
  const [isResettingLicense, setIsResettingLicense] = useState(false); // New State for Reset Animation

  // Use hook for actions, but prefer props for state if available
  const { activate, loading: isLicenseLoading, resetLicense } = useCbtschoolLicense();
  
  // Use props if provided (from App.tsx), otherwise fallback to hook (though App.tsx should always provide)
  // We don't use hook state for isLocked/profile to avoid desync with App.tsx
  const isLocked = propsIsLocked;
  const licenseProfile = propsLicenseProfile;
  const licenseError = propsLicenseError;

  const [restoreProgress, setRestoreProgress] = useState<{ percent: number, message: string } | null>(null);

  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false); // New State for Confirmation Modal

  const handleResetLicenseClick = () => {
      setIsConfirmResetOpen(true);
  };

  const handleConfirmReset = async () => {
      setIsConfirmResetOpen(false);
      setIsResettingLicense(true);
      
      // FAST UX: Reduced delay from 2000ms to 300ms
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await resetLicense();
      
      // Force reload after animation
      window.location.reload();
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type, key: Date.now() });
  };

  // OPTIMISASI: Fungsi fetch parsial untuk update cepat
  const fetchTestsData = useCallback(async () => {
    try {
      // Hanya ambil data tests dan count questions untuk performa maksimal
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*, questions(count)');

      if (testsError) throw new Error('Gagal mengambil data ujian.');

      setTests((prevTests: Map<string, Test>) => {
        const newTestsMap = new Map<string, Test>(prevTests);
        (testsData || []).forEach((t: any) => {
          const existingTest = prevTests.get(t.token);
          const questionCount = t.questions?.[0]?.count || 0;
          
          newTestsMap.set(t.token, {
            details: { 
              ...t, 
              duration: `${t.duration_minutes} Menit`, 
              durationMinutes: t.duration_minutes, 
              questionsToDisplay: t.questions_to_display, 
              randomizeQuestions: t.randomize_questions,
              randomizeAnswers: t.randomize_answers,
              examType: t.exam_type || 'Umum',
              time: '',
              questionCount: questionCount
            },
            questions: existingTest?.questions || [],
          });
        });
        return newTestsMap;
      });
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  }, []);

  // --- Derived State ---
  const testIdToTokenMap = useMemo(() => {
    const map = new Map<string, string>();
    tests.forEach((t) => map.set(t.details.id, t.details.token || ''));
    return map;
  }, [tests]);

  const fetchQuestionsForTest = useCallback(async (token: string, testId?: string) => {
    let targetTestId = testId;
    
    if (!targetTestId) {
      const test = tests.get(token);
      if (!test) return;
      targetTestId = test.details.id;
    }
    
    setIsFetchingQuestions(true);
    try {
      const { data: questionsData, error } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', targetTestId)
        .order('id', { ascending: true });

      if (error) throw error;

      const formattedQuestions: Question[] = (questionsData || []).map((q: any) => ({
        ...q,
        image: q.image_url,
        optionImages: q.option_images,
        correctAnswerIndex: q.correct_answer_index,
        type: q.type,
        answerKey: q.answer_key,
        metadata: q.metadata,
        weight: q.weight,
        matchingRightOptions: q.matching_right_options
      }));

      setTests((prev: Map<string, Test>) => {
        const next = new Map<string, Test>(prev);
        const t = next.get(token);
        if (t) {
          next.set(token, { details: t.details, questions: formattedQuestions });
        }
        return next;
      });
    } catch (error: any) {
      showToast(`Gagal memuat soal: ${error.message}`, 'error');
    } finally {
      setIsFetchingQuestions(false);
    }
  }, [tests]);

  const fetchMasterDataOnly = useCallback(async () => {
    try {
        const [{ data: classesData, error: classesError }, { data: majorsData, error: majorsError }] = await Promise.all([
            supabase.from('master_classes').select('*'),
            supabase.from('master_majors').select('*'),
        ]);
        if (classesError || majorsError) throw new Error('Gagal mengambil data master.');
        setMasterData({ classes: classesData as MasterDataItem[], majors: majorsData as MasterDataItem[] });
    } catch (error: any) {
        showToast(error.message, 'error');
    }
  }, []);

  // UPDATE: Split fetch into Initial (Critical) and Background (Heavy)
  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setIsInitialLoad(true);
    
    try {
      // 1. CRITICAL DATA (Fast Load)
      const [
        { data: testsData, error: testsError },
        { data: classesData, error: classesError },
        { data: majorsData, error: majorsError },
        { data: announcementsData, error: announcementsError },
        { data: schedulesData, error: schedulesError },
        { count: userCount, error: userCountError }, // Just count first
        { count: teacherCountData },
        { count: adminCountData },
        { count: studentCountData },
      ] = await Promise.all([
        supabase.from('tests').select('*, questions:questions(count)'),
        supabase.from('master_classes').select('*'),
        supabase.from('master_majors').select('*'),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5), // Limit announcements
        supabase.from('schedules').select('*'),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      ]);

      if (testsError || classesError || majorsError || announcementsError || schedulesError) {
        throw new Error('Gagal mengambil data kritis.');
      }

      if (userCountError) {
          console.error("User Count Error:", userCountError);
      }

      // Process Critical Data
      setTotalUserCount(userCount || 0); // Set Count Immediately
      setRealTeacherCount(teacherCountData || 0);
      setRealAdminCount(adminCountData || 0);
      setRealStudentCount(studentCountData || 0);
      setMasterData({ classes: classesData as MasterDataItem[], majors: majorsData as MasterDataItem[] });
      setAnnouncements(announcementsData.map(a => ({ ...a, date: a.created_at })) as Announcement[]);
      
      const newTestsMap = new Map<string, Test>();
      (testsData || []).forEach(t => {
        const questionCount = t.questions?.[0]?.count || 0;
        newTestsMap.set(t.token, {
          details: { 
            ...t, 
            duration: `${t.duration_minutes} Menit`, 
            durationMinutes: t.duration_minutes, 
            questionsToDisplay: t.questions_to_display, 
            randomizeQuestions: t.randomize_questions,
            randomizeAnswers: t.randomize_answers,
            examType: t.exam_type || 'Umum',
            time: '',
            questionCount: questionCount
          },
          questions: [], 
        });
      });
      setTests(newTestsMap);

      // Map Schedules (Needs tests map, so we do it here or after)
      // We need a temporary map for schedule mapping since state update is async
      const tempTestIdMap = new Map<string, string>();
      (testsData || []).forEach(t => tempTestIdMap.set(t.id, t.token));

      const mappedSchedules: Schedule[] = (schedulesData || []).map((s: any): Schedule => ({
        id: s.id,
        testToken: tempTestIdMap.get(s.test_id) || '',
        startTime: s.start_time,
        endTime: s.end_time,
        assignedTo: s.assigned_to || [],
      })).filter(s => s.testToken);
      setSchedules(mappedSchedules);

      // Stop Loading Spinner HERE - UI is ready
      if (!isBackgroundRefresh) setIsInitialLoad(false);

      // 2. BACKGROUND DATA (Heavy) - Users & Sessions
      // We fetch this silently to populate charts/tables
      const { data: usersData, error: usersError } = await supabase.from('users').select('*');
      const { data: sessionsData, error: sessionsError } = await supabase.from('student_exam_sessions').select('*, schedule:schedules(test_id)');

      if (!usersError && usersData) {
          const mappedUsers = usersData.map((u: any): User => {
            const gender = u.gender || 'Laki-laki';
            const defaultPhoto = gender === 'Perempuan' ? DEFAULT_PROFILE_IMAGES.STUDENT_FEMALE : DEFAULT_PROFILE_IMAGES.STUDENT_MALE;
            return {
              id: u.id,
              username: u.username,
              qr_login_password: u.qr_login_password,
              fullName: u.full_name,
              nisn: u.nisn,
              class: u.class,
              major: u.major,
              gender: gender,
              religion: u.religion,
              photoUrl: u.photo_url || defaultPhoto,
              updated_at: u.updated_at,
              password_text: u.password_text 
            };
          });
          setUsers(mappedUsers);
      }

      if (!sessionsError && sessionsData) {
          setExamSessions(sessionsData);
      }

    } catch (error: any) {
      // User Request: Suppress "Gagal mengambil data kritis" notification
      if (error.message !== 'Gagal mengambil data kritis.') {
          showToast(error.message, 'error');
      } else {
          console.warn('[AdminDashboard] Critical data fetch failed (Toast suppressed by user request).');
      }
      
      if (!isBackgroundRefresh) setIsInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- CRUD Handlers ---
  
  const handleAdminPasswordChange = async (newPassword: string): Promise<boolean> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if(error) { showToast(`Gagal: ${error.message}. Anda mungkin perlu login ulang dulu.`, 'error'); return false; }
    showToast('Password admin berhasil diubah.', 'success');
    return true;
  };

  const handleSyncAdminPasswordForQR = async (password: string): Promise<boolean> => {
      setIsProcessing(true);
      const { error } = await supabase
        .from('users')
        .update({ qr_login_password: password })
        .eq('id', user.id);

      setIsProcessing(false);
      if (error) {
        showToast(`Gagal sinkronisasi password: ${error.message}`, 'error');
        return false;
      }

      showToast('Sinkronisasi berhasil! Anda akan logout untuk menerapkan perubahan.', 'success');
      setTimeout(() => {
          onLogout();
      }, 2500);
      return true;
  };

  const handleAddTest = async (details: Omit<TestDetails, 'id' | 'time'>, token: string, questions: Omit<Question, 'id'>[]): Promise<boolean> => {
    const { data: testData, error: testError } = await supabase.from('tests').insert({
        token: token.toUpperCase(), name: details.name, subject: details.subject,
        duration_minutes: details.durationMinutes, questions_to_display: details.questionsToDisplay ?? 0,
        randomize_questions: details.randomizeQuestions, // Save randomization settings
        randomize_answers: details.randomizeAnswers,      // Save randomization settings
        exam_type: details.examType || 'Umum'            // Save exam type
    }).select().single();
    
    if(testError) { 
      if (testError.code === '23505' || testError.message.includes('duplicate key')) {
        showToast('Gagal: Token Ujian sudah digunakan. Silakan gunakan token lain.', 'error');
      } else {
        showToast(`Gagal membuat ujian: ${testError.message}`, 'error'); 
      }
      return false; 
    }
    if(questions.length > 0) {
      const questionsToInsert = questions.map(q => ({
        test_id: testData.id, 
        type: q.type, // PENTING: Kirim tipe soal
        question: q.question, 
        image_url: q.image, 
        options: q.options, 
        option_images: q.optionImages,
        correct_answer_index: q.type === 'multiple_choice' ? (q.answerKey?.index || 0) : 0, // FIX: Manual Save Logic
        answer_key: q.answerKey, // PENTING: Kirim struktur jawaban baru (Fix: use answerKey from object)
        matching_right_options: q.matchingRightOptions,
        metadata: q.metadata,    // PENTING: Kirim metadata (misal: soal menjodohkan)
        weight: q.weight,        // PENTING: Kirim bobot
        difficulty: q.difficulty, 
        topic: q.topic
      }));
      const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
      if(qError) { showToast(`Ujian dibuat, tapi gagal impor soal: ${qError.message}`, 'error'); }
    }
    await fetchTestsData(); return true;
  };

  const handleUpdateTest = async (updatedTest: Test, originalToken: string) => {
    const { error } = await supabase.from('tests').update({
        token: updatedTest.details.token || originalToken, name: updatedTest.details.name, subject: updatedTest.details.subject,
        duration_minutes: updatedTest.details.durationMinutes, questions_to_display: updatedTest.details.questionsToDisplay ?? 0,
        randomize_questions: updatedTest.details.randomizeQuestions, // Update randomization settings
        randomize_answers: updatedTest.details.randomizeAnswers,      // Update randomization settings
        exam_type: updatedTest.details.examType || 'Umum'            // Update exam type
    }).eq('id', updatedTest.details.id);
    if(error) { showToast(`Gagal update ujian: ${error.message}`, 'error'); } else { await fetchTestsData(); }
  };
  const handleDeleteTest = async (token: string) => { 
    const testId = tests.get(token)?.details.id;
    if(!testId) return;
    const { error } = await supabase.from('tests').delete().eq('id', testId); // Cascade delete should handle questions
    if(error) { showToast(`Gagal hapus ujian: ${error.message}`, 'error'); } else { await fetchTestsData(); }
  };
  
  // FIX: MANUAL ADD QUESTION LOGIC
  const handleAddQuestion = async (token: string, q: Omit<Question, 'id'>): Promise<boolean> => {
    const testId = tests.get(token)?.details.id;
    if(!testId) return false;
    
    // FIX: Extract integer index for legacy column
    const correctIdx = q.type === 'multiple_choice' ? (q.answerKey?.index || 0) : 0;

    const { error = null } = await supabase.from('questions').insert({
      test_id: testId, 
      type: q.type, // PENTING
      question: q.question, 
      image_url: q.image, 
      options: q.options, 
      matching_right_options: q.matchingRightOptions,
      option_images: q.optionImages,
      correct_answer_index: correctIdx, // PENTING: Wajib diisi untuk manual save
      answer_key: q.answerKey, // PENTING (Fix: use answerKey from object)
      metadata: q.metadata,    // PENTING
      weight: q.weight,        // PENTING
      difficulty: q.difficulty, 
      topic: q.topic
    });
    if(error) {
        showToast(`Gagal menyimpan soal: ${error.message}`, 'error');
        return false;
    }
    await fetchTestsData(); 
    await fetchQuestionsForTest(token, testId);
    return true;
  };

  const handleUpdateQuestion = async (token: string, q: Question) => {
    // FIX: Extract integer index for legacy column during update
    const correctIdx = q.type === 'multiple_choice' ? (q.answerKey?.index || 0) : 0;

    const { error } = await supabase.from('questions').update({
      type: q.type, // PENTING
      question: q.question, 
      image_url: q.image, 
      options: q.options, 
      matching_right_options: q.matchingRightOptions,
      option_images: q.optionImages,
      correct_answer_index: correctIdx, // PENTING
      answer_key: q.answerKey, // PENTING (Fix: use answerKey from object)
      metadata: q.metadata,    // PENTING
      weight: q.weight,        // PENTING
      difficulty: q.difficulty, 
      topic: q.topic
    }).eq('id', q.id);
    if(error) {
        showToast(`Gagal update soal: ${error.message}`, 'error');
    } else {
        await fetchTestsData();
        await fetchQuestionsForTest(token);
    }
  };
  
  // FIX: DELETE QUESTION HANDLER (UPDATED)
  const handleDeleteQuestion = async (token: string, qId: number) => {
    setIsProcessing(true);
    const { error } = await supabase.from('questions').delete().eq('id', qId);
    
    setIsProcessing(false);
    if(error) {
      showToast(`Gagal menghapus soal: ${error.message}`, 'error');
    } else {
      showToast('Soal berhasil dihapus.', 'success');
      await fetchTestsData(); // Refresh count
      const testId = tests.get(token)?.details.id;
      await fetchQuestionsForTest(token, testId); // Refresh list
    }
  };

  const handleBulkAddQuestions = async (token: string, questions: Omit<Question, 'id'>[]) => {
      const testId = tests.get(token)?.details.id;
      if(!testId) return;
      
      const questionsToInsert = questions.map(q => ({
        test_id: testId, 
        type: q.type, // PENTING
        question: q.question, 
        image_url: q.image, 
        options: q.options, 
        matching_right_options: q.matchingRightOptions,
        option_images: q.optionImages,
        correct_answer_index: q.type === 'multiple_choice' ? (q.answerKey?.index || 0) : 0, // FIX: Bulk add also needs this
        answer_key: q.answerKey, // PENTING (Fix: use answerKey from object)
        metadata: q.metadata,    // PENTING
        weight: q.weight,        // PENTING
        difficulty: q.difficulty, 
        topic: q.topic
      }));
      const { error } = await supabase.from('questions').insert(questionsToInsert);
      if(error) showToast(`Gagal impor soal massal: ${error.message}`, 'error');
      else { 
        showToast(`${questions.length} soal berhasil diimpor!`, 'success'); 
        await fetchTestsData(); 
        await fetchQuestionsForTest(token);
      }
  };

  // Other CRUD handlers (MasterData, Schedules, Announcements, Backup)
  const createCrudHandler = (table: string, idField = 'id', refreshFn: () => Promise<void> = async () => { await fetchData(); }) => ({
    add: async (item: any) => { 
        const { error } = await supabase.from(table).insert(item); 
        if(error) {
            showToast(`Gagal menambah data: ${error.message}`, 'error');
        } else {
            await refreshFn();
            showToast('Data berhasil ditambahkan', 'success');
        }
    },
    update: async (item: any) => { 
        const { error } = await supabase.from(table).update(item).eq(idField, item[idField]); 
        if(error) {
            showToast(`Gagal update data: ${error.message}`, 'error');
        } else {
            await refreshFn();
            showToast('Data berhasil diperbarui', 'success');
        }
    },
    delete: async (item: any) => { 
        const { error } = await supabase.from(table).delete().eq(idField, item[idField]); 
        if(error) {
            showToast(`Gagal menghapus data: ${error.message}`, 'error');
        } else {
            await refreshFn();
            showToast('Data berhasil dihapus', 'success');
        }
    },
  });

  const masterClassHandlers = createCrudHandler('master_classes', 'id', fetchMasterDataOnly);
  const masterMajorHandlers = createCrudHandler('master_majors', 'id', fetchMasterDataOnly);
  
  const handleAddMasterItem = (type: 'classes' | 'majors', name: string) => {
      // Generate ID client-side to ensure it exists if DB doesn't auto-generate
      const payload = { id: uuidv4(), name };
      if(type === 'classes') masterClassHandlers.add(payload); else masterMajorHandlers.add(payload);
  };
  const handleUpdateMasterItem = (type: 'classes' | 'majors', item: MasterDataItem) => {
      if(type === 'classes') masterClassHandlers.update(item); else masterMajorHandlers.update(item);
  };
  const handleDeleteMasterItem = (type: 'classes' | 'majors', item: MasterDataItem) => {
      if(type === 'classes') masterClassHandlers.delete(item); else masterMajorHandlers.delete(item);
  };

  
  const handleAddSchedule = async (s: Omit<Schedule, 'id'>) => {
    setIsProcessing(true);
    const testId = tests.get(s.testToken)?.details.id;
    if(!testId) {
      showToast('Ujian yang dipilih tidak valid.', 'error');
      setIsProcessing(false);
      return;
    }
    const { error } = await supabase.from('schedules').insert({
      test_id: testId,
      start_time: s.startTime,
      end_time: s.endTime,
      assigned_to: s.assignedTo
    });
    
    setIsProcessing(false);
    if(error) {
      showToast(`Gagal membuat jadwal: ${error.message}`, 'error');
    } else {
      showToast('Jadwal berhasil dibuat!', 'success');
      await fetchData();
    }
  };
  const handleUpdateSchedule = async (s: Schedule) => {
    setIsProcessing(true);
    const testId = tests.get(s.testToken)?.details.id;
    if(!testId) {
      showToast('Ujian yang dipilih tidak valid.', 'error');
      setIsProcessing(false);
      return;
    }
    const { error } = await supabase.from('schedules').update({
      test_id: testId,
      start_time: s.startTime,
      end_time: s.endTime,
      assigned_to: s.assignedTo
    }).eq('id', s.id);

    setIsProcessing(false);
    if(error) {
      showToast(`Gagal memperbarui jadwal: ${error.message}`, 'error');
    } else {
      showToast('Jadwal berhasil diperbarui!', 'success');
      await fetchData();
    }
  };
  const handleDeleteSchedule = async (id: string) => {
    setIsProcessing(true);
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    
    setIsProcessing(false);
    if(error) {
      showToast(`Gagal menghapus jadwal: ${error.message}`, 'error');
    } else {
      showToast('Jadwal berhasil dihapus.', 'success');
      await fetchData();
    }
  };

  // Data Actions
  const handleRestoreData = async (backupData: any) => {
    setIsProcessing(true);
    setRestoreProgress({ percent: 10, message: 'Menghubungi server untuk memulai restore...' });
    setIsBatchProcessing(true);
  
    try {
      setRestoreProgress({ percent: 50, message: 'Server sedang memproses... Ini mungkin butuh waktu.' });

      const { data, error } = await supabase.rpc('admin_restore_data', { backup_data: backupData });

      if (error) {
        throw error;
      }
      
      setRestoreProgress({ percent: 100, message: 'Selesai! Memuat ulang data...' });
      await new Promise(r => setTimeout(r, 1500));
      showToast(data || 'Data berhasil dipulihkan!', 'success');
      await fetchData();
  
    } catch (error: any) {
      console.error("Restore failed:", error);
      showToast(`Restore gagal: ${error.message}`, 'error');
    } finally {
      setRestoreProgress(null);
      setIsProcessing(false);
      setIsBatchProcessing(false);
    }
  };
  
  const handleDeleteData = async (modules: { [key: string]: boolean }) => { 
    setIsProcessing(true);
    showToast('Sedang menghapus data...', 'success');

    try {
        const { data, error } = await supabase.rpc('admin_mass_delete', { selected_modules: modules });

        if (error) {
            throw error;
        }

        showToast(data || 'Pembersihan data selesai!', 'success');
        await fetchData();
        
        // Jika menghapus user, mungkin perlu logout jika logic app bergantung pada session user lama
        if (modules.users) {
            // Kita tidak perlu logout admin, tapi kita pastikan data lokal dibersihkan
            console.log("Users deleted from DB, local data refreshed.");
        }

    } catch (error: any) {
        console.error("Mass delete failed:", error);
        showToast(`Gagal menghapus data: ${error.message}`, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  const studentUsers = useMemo(() => users.filter(u => u.role === 'student'), [users]);
  // const teacherCount = useMemo(() => users.filter(u => u.role === 'teacher').length, [users]); // REPLACED BY REAL COUNT
  // const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);     // REPLACED BY REAL COUNT
  const questionCount = useMemo(() => Array.from(tests.values()).reduce((acc: number, test: Test) => acc + test.questions.length, 0), [tests]);
  const activeSessionCount = useMemo(() => examSessions.filter(s => s.status === 'Mengerjakan').length, [examSessions]);
  
  // Navigation
  const navItems: NavItem[] = useMemo(() => {
    if (isLocked) {
        return [
            { id: AdminView.LICENSE, label: 'Aktivasi Lisensi', icon: <Lock className="h-5 w-5" /> }
        ];
    }
    return [
    { id: AdminView.HOME, label: 'Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg> },
    { id: AdminView.DATA_MASTER, label: 'Data Master', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg> },
    { id: AdminView.MANAJEMEN_USER, label: 'Manajemen User', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg> },
    { id: AdminView.QUESTION_BANK, label: 'Bank Soal', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2V7a1 1 0 00-1-1H6V5z" clipRule="evenodd" /></svg> },
    { id: AdminView.JADWAL_UJIAN, label: 'Jadwal Ujian', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg> },
    { id: AdminView.UBK, label: 'Pemantauan Ujian', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg> },
    { id: AdminView.CETAK_DOKUMEN, label: 'Berita Acara & Absen', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /><path d="M9 11a1 1 0 100 2h6a1 1 0 100-2H9z" /></svg> },
    { id: AdminView.CETAK, label: 'Cetak Kartu Siswa', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h8a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" /></svg> },
    { id: AdminView.REKAPITULASI_NILAI, label: 'Rekapitulasi Nilai', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> },
    { id: AdminView.BACKUP_DATA, label: 'Backup & Restore', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg> },
    { id: AdminView.CONFIG, label: 'Konfigurasi', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.96.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg> },
    { id: AdminView.CETAK_ADMIN_CARD, label: 'Cetak Kartu Admin', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 001-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg> },
    { id: AdminView.LICENSE, label: 'Info Lisensi', icon: <ShieldCheck className="h-5 w-5" /> }
  ];
  }, [isLocked]);

  // Force License View if Locked
  useEffect(() => {
    if (isLocked) {
        setActiveView(AdminView.LICENSE);
    } else if (activeView === AdminView.LICENSE && !isLocked) {
        setActiveView(AdminView.HOME);
    }
  }, [isLocked]);

  // Removed duplicate testIdToTokenMap definition
  // const testIdToTokenMap = useMemo(() => { ...

  // --- Derived State ---
  const mappedSchedules: Schedule[] = useMemo(() => (schedules || []).map((s: any): Schedule => ({
    id: s.id,
    testToken: testIdToTokenMap.get(s.test_id) || '',
    startTime: s.start_time,
    endTime: s.end_time,
    assignedTo: s.assigned_to || [],
  })).filter(s => s.testToken), [schedules, testIdToTokenMap]);

  // --- Realtime Subscription for Exam Sessions ---
  useEffect(() => {
    let channel: any;
    try {
      channel = supabase
        .channel('admin_exam_sessions_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_exam_sessions' }, (payload) => {
          const changedRecord = payload.new as any;
          if (!changedRecord) return;

          setExamSessions((prevSessions) => {
            const index = prevSessions.findIndex((s) => s.id === changedRecord.id);
            if (index !== -1) {
              const updated = [...prevSessions];
              updated[index] = { ...updated[index], ...changedRecord };
              return updated;
            } else {
              return [...prevSessions, changedRecord];
            }
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // console.log('Realtime subscribed!');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime subscription error (likely due to Mixed Content). Ignoring.');
          }
        });
    } catch (err) {
      console.warn('Failed to initialize Realtime subscription:', err);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleNavigate = (view: AdminView, token?: string) => {
    setPreselectedTestToken(token);
    setActiveView(view);
    if(window.innerWidth < 1024) setSidebarOpen(false);
  };

  const renderContent = () => {
    // STRICT LOCK ENFORCEMENT: Override any view if locked
    if (isLocked) {
        return <LicenseActivation onActivate={activate} loading={isLicenseLoading} globalError={licenseError} />;
    }

    switch (activeView) {
      case AdminView.HOME: return <DashboardHome adminUser={user} config={config} studentUsers={studentUsers} studentCount={realStudentCount} teacherCount={realTeacherCount} adminCount={realAdminCount} tests={tests} questionCount={questionCount} onNavigate={handleNavigate} activeSessionCount={activeSessionCount} examSessions={examSessions} totalDatabaseRecords={totalUserCount} />;
      case AdminView.DATA_MASTER: return <DataMaster masterData={masterData} users={users} onAddItem={handleAddMasterItem} onUpdateItem={handleUpdateMasterItem} onDeleteItem={handleDeleteMasterItem} onMergeMasterData={() => {}} />;
      case AdminView.MANAJEMEN_USER: return <UserManagement />;
      case AdminView.JADWAL_UJIAN: return <ExamSchedule schedules={schedules} tests={tests} masterData={masterData} onAddSchedule={handleAddSchedule} onUpdateSchedule={handleUpdateSchedule} onDeleteSchedule={handleDeleteSchedule} />;
      case AdminView.QUESTION_BANK: return <QuestionBank tests={tests} onAddQuestion={handleAddQuestion} onUpdateQuestion={handleUpdateQuestion} onDeleteQuestion={handleDeleteQuestion} onAddTest={handleAddTest} onUpdateTest={handleUpdateTest} onDeleteTest={handleDeleteTest} onBulkAddQuestions={handleBulkAddQuestions} onImportError={(msg) => showToast(msg, 'error')} preselectedToken={preselectedTestToken} onRefresh={() => fetchTestsData()} onFetchQuestions={fetchQuestionsForTest} isFetchingQuestions={isFetchingQuestions} />;
      case AdminView.UBK: return <UbkMonitor users={users} tests={tests} />;
      case AdminView.CETAK: return <ExamCards users={studentUsers} config={config} />;
      case AdminView.CETAK_DOKUMEN: return <PrintDocuments users={studentUsers} tests={tests} examSessions={examSessions} config={config} masterData={masterData} />; // New Component
      case AdminView.REKAPITULASI_NILAI: return <GradeRecap tests={tests} users={studentUsers} examSessions={examSessions} schedules={mappedSchedules} preselectedToken={preselectedTestToken} config={config} onRefresh={() => fetchData(true)} />;
      case AdminView.BACKUP_DATA: return <BackupScreen config={config} users={users} tests={tests} masterData={masterData} announcements={announcements} schedules={schedules} onRestoreData={handleRestoreData} onDeleteData={handleDeleteData} isProcessing={isProcessing} />;
      case AdminView.CONFIG: return <ConfigurationScreen config={config} onUpdateConfig={onUpdateConfig} user={user} onLogout={onLogout} onAdminPasswordChange={handleAdminPasswordChange} onSyncAdminPasswordForQR={handleSyncAdminPasswordForQR} isProcessing={isProcessing} isLicensed={!isLocked} licenseProfile={licenseProfile} />;
      case AdminView.CETAK_ADMIN_CARD: return <AdminCard adminUser={user} config={config} />;
      case AdminView.LICENSE: 
        if (isLocked) {
            return <LicenseActivation onActivate={async (key) => {
                const result = await activate(key);
                if (result.success) {
                    // Force reload to sync config (School Name, etc) from DB
                    window.location.reload();
                }
                return result;
            }} loading={isLicenseLoading} globalError={licenseError} />;
        } else {
            return (
                <div className="p-8 bg-white rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="text-green-600" />
                        Status Lisensi
                    </h2>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-full">
                                <ShieldCheck className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <p className="font-bold text-green-800">Aplikasi Terlisensi Resmi</p>
                                <p className="text-sm text-green-700">Terima kasih telah menggunakan CBT School Enterprise.</p>
                            </div>
                        </div>
                    </div>
                    
                    {licenseProfile && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sekolah Terdaftar</label>
                                <p className="text-lg font-medium text-gray-900">{licenseProfile.school_name}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">NPSN</label>
                                <p className="text-lg font-medium text-gray-900">{licenseProfile.npsn}</p>
                            </div>
                        </div>
                    )}

                    <div className="border-t border-gray-200 pt-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Pengaturan Lisensi</h3>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div>
                                <p className="font-medium text-gray-900">Reset Lisensi Aplikasi</p>
                                <p className="text-sm text-gray-500">Tindakan ini akan menghapus lisensi aktif dan mengunci aplikasi kembali ke mode default.</p>
                            </div>
                            <button
                                onClick={handleResetLicenseClick}
                                disabled={isResettingLicense}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${isResettingLicense ? 'bg-red-600' : 'bg-gray-200 hover:bg-red-200'}`}
                                role="switch"
                                aria-checked={isResettingLicense}
                            >
                                <span className="sr-only">Reset Lisensi</span>
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isResettingLicense ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>
                        <div className="mt-2 text-right">
                             <button 
                                onClick={handleResetLicenseClick}
                                disabled={isResettingLicense}
                                className="text-sm text-red-600 hover:text-red-800 font-medium underline disabled:opacity-50"
                             >
                                 Atau klik di sini untuk reset
                             </button>
                        </div>
                    </div>
                </div>
            );
        }
      default: return <div>Not Implemented</div>
    }
  };

  // --- OVERLAY: CONFIRMATION MODAL ---
  if (isConfirmResetOpen) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-scale-up">
                  <div className="flex items-center gap-4 mb-4 text-red-600">
                      <div className="bg-red-100 p-3 rounded-full">
                          <AlertTriangle className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">Konfirmasi Reset</h3>
                  </div>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed">
                      Apakah Anda yakin ingin mereset lisensi aplikasi? <br/><br/>
                      <span className="font-semibold text-red-600">Peringatan:</span> Tindakan ini akan menghapus lisensi aktif dari perangkat ini dan mengunci aplikasi kembali ke mode default. Data sekolah akan disembunyikan.
                  </p>
                  
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setIsConfirmResetOpen(false)}
                          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                      >
                          Batal
                      </button>
                      <button 
                          onClick={handleConfirmReset}
                          className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium shadow-lg shadow-red-600/30 transition-all transform hover:scale-105"
                      >
                          Ya, Reset Sekarang
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- OVERLAY: SYSTEM RESET ---
  if (isResettingLicense) {
      return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-900 text-white animate-fade-in">
              <div className="bg-white p-2 rounded-full mb-6 animate-bounce">
                  <ShieldCheck className="w-12 h-12 text-red-600" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Mereset Sistem...</h2>
              <p className="text-red-200 mb-8 text-center max-w-md">Mohon tunggu sebentar. Aplikasi sedang menghapus konfigurasi lisensi dan akan dimuat ulang secara otomatis.</p>
              
              <div className="w-64 h-2 bg-red-800 rounded-full overflow-hidden">
                  <div className="h-full bg-white animate-progress"></div>
              </div>
          </div>
      );
  }

  // if (isDataLoading) {
  //   return (
  //       <div className="h-full w-full flex flex-col items-center justify-center text-gray-600 bg-slate-100">
  //           <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
  //           <p className="animate-pulse text-lg">Memuat Dasbor Admin...</p>
  //       </div>
  //   );
  // }

  return (
    <div className="h-full flex bg-slate-100">
      {notification && <ToastNotification key={notification.key} message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      {isImporting && <BulkImportProgress processed={importProgress.processed} total={importProgress.total} errors={importProgress.errors} onClose={() => setIsImporting(false)} />}
      {restoreProgress !== null && <RestoreProgressModal progress={restoreProgress.percent} message={restoreProgress.message} />}
      {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 lg:hidden" aria-hidden="true"></div>}

      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex-col flex-shrink-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-20 flex items-center justify-center px-4 border-b border-slate-800">
             <div className="flex items-center space-x-3"><img src={config.logoUrl} alt="Logo" className="h-10 w-10 object-contain" /><span className="font-bold text-white text-lg">{config.schoolName}</span></div>
          </div>
          <nav className="flex-grow p-4 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map(item => (
                <li key={item.id}>
                  <button onClick={() => handleNavigate(item.id)} className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-all duration-200 group ${ activeView === item.id ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 hover:text-white'}`}>
                    <div className="relative">{item.icon}{activeView === item.id && <span className="absolute -left-4 top-1/2 -translate-y-1/2 h-5 w-1 bg-white rounded-r-full"></span>}</div>
                    <span className="font-semibold text-sm flex-grow">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          
          {/* Tombol Logout Sidebar (Ditambahkan) */}
          <div className="p-4 border-t border-slate-800">
              <button 
                onClick={onLogout} 
                className="w-full flex items-center space-x-3 p-3 rounded-lg text-left hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors group"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-semibold text-sm">Keluar / Logout</span>
              </button>
          </div>
      </aside>

      <div className="flex-grow flex flex-col w-full min-w-0">
          <header className="h-20 bg-white flex items-center justify-between px-4 sm:px-8 border-b border-slate-200 flex-shrink-0 relative">
            {/* Loading Indicator */}
            {isInitialLoad && (
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-100 overflow-hidden">
                    <div className="h-full bg-blue-600 animate-progress"></div>
                </div>
            )}
            <div className="flex items-center min-w-0">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 mr-4"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                <div className="min-w-0"><h1 className="text-lg sm:text-xl font-bold text-gray-800 truncate">Selamat datang, {user.fullName}!</h1><p className="text-sm text-gray-500 hidden sm:block">Ini adalah ringkasan aktivitas sekolah Anda hari ini.</p></div>
            </div>
             <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="relative">
                <button onClick={() => setProfileOpen(!isProfileOpen)} className="w-10 h-10 rounded-full bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"><img src={user.photoUrl} alt="Admin" className="w-full h-full rounded-full object-cover"/></button>
                {isProfileOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl py-1 z-20 animate-fade-in">
                        <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate(AdminView.CETAK_ADMIN_CARD); setProfileOpen(false); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-slate-100">Cetak Kartu Admin</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onLogout(); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-slate-100 text-red-600 font-semibold">Logout</a>
                    </div>
                )}
              </div>
            </div>
          </header>
          
          <main className="flex-grow p-4 sm:p-8 overflow-y-auto">
            {renderContent()}
          </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
