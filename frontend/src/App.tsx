import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardLayout from './components/DashboardLayout'
import DpaDashboardLayout from './components/DpaDashboardLayout'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CommandCenter from './pages/CommandCenter'
import UserDashboardLayout from './components/UserDashboardLayout'
import UserDashboard from './pages/UserDashboard'
import UserKuisioner from './pages/UserKuisioner'
import Responden from './pages/Responden'
import PrediksiIndividu from './pages/PrediksiIndividu'
import AnalitikRules from './pages/AnalitikRules'
import QuantumCognition from './pages/QuantumCognition'
import ModelEvaluasi from './pages/ModelEvaluasi'
import ManajemenUser from './pages/ManajemenUser'
import PengaturanSistem from './pages/PengaturanSistem'
import Laporan from './pages/Laporan'
import RiskCenter from './pages/RiskCenter'
import HappinessAnalitik from './pages/HappinessAnalitik'
import DpaDashboard from './pages/dpa/DpaDashboard'
import DpaStudentList from './pages/dpa/DpaStudentList'
import DpaStudentDetail from './pages/dpa/DpaStudentDetail'
import DpaWarnings from './pages/dpa/DpaWarnings'
import DpaLaporan from './pages/dpa/DpaLaporan'
import DpaGroupChat from './pages/dpa/DpaGroupChat'
import DpaProfil from './pages/dpa/DpaProfil'
import DpaBimbingan from './pages/dpa/DpaBimbingan'
import StaffLayout from './components/StaffLayout'
import StaffDashboard from './pages/staff/StaffDashboard'
import UserAsesmenHistory from './pages/UserAsesmenHistory'
import UserCurhat from './pages/UserCurhat'
import HappinessAssessment from './pages/userDashboard/HappinessAssessment'
import HappinessIndex from './pages/userDashboard/HappinessIndex'
import HappinessHistory from './pages/userDashboard/HappinessHistory'
import BurnoutHasil from './pages/userDashboard/BurnoutHasil'
import WellBeingComparison from './pages/userDashboard/WellBeingComparison'
import FaktorKondisi from './pages/userDashboard/FaktorKondisi'
import Rekomendasi from './pages/userDashboard/Rekomendasi'
import StudentGroupChat from './pages/userDashboard/StudentGroupChat'
import DpaDirectory from './pages/userDashboard/DpaDirectory'
import BimbinganAkademik from './pages/userDashboard/BimbinganAkademik'
import UserProfileSettings from './pages/userDashboard/UserProfileSettings'
import UserNetwork from './pages/userDashboard/UserNetwork'
import UserProfilePage from './pages/userDashboard/UserProfilePage'
import UserCinema from './pages/userDashboard/UserCinema'
import UserRecoveryPlan from './pages/userDashboard/UserRecoveryPlan'
import NotFound from './pages/NotFound'
import ForgotPassword from './pages/ForgotPassword'
import RequireRole from './components/RequireRole'
import LegacyUserRedirect from './components/LegacyUserRedirect'

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* Public pages tanpa layout (Full Screen) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Public pages pakai layout lama */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/assessment" element={<LegacyUserRedirect to="/user/kuisioner" />} />
          <Route path="/gosip" element={<LegacyUserRedirect to="/user/curhat" />} />
          <Route path="/terapi" element={<LegacyUserRedirect to="/user/curhat" />} />
        </Route>

        {/* Dashboard pakai layout sidebar baru (Kaprodi / superadmin) */}
        <Route element={<RequireRole allow={['superadmin']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/command-center" element={<CommandCenter />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/responden" element={<Responden />} />
            <Route path="/prediksi" element={<PrediksiIndividu />} />
            <Route path="/analitik" element={<AnalitikRules />} />
            <Route path="/wellbeing-analitik" element={<HappinessAnalitik />} />
            <Route path="/quantum" element={<QuantumCognition />} />
            <Route path="/model" element={<ModelEvaluasi />} />
            <Route path="/users" element={<ManajemenUser />} />
            <Route path="/settings" element={<PengaturanSistem />} />
            <Route path="/laporan" element={<Laporan />} />
            <Route path="/risk-center" element={<RiskCenter />} />
          </Route>
        </Route>

        {/* Dashboard DPA (dosen pembimbing akademik) */}
        <Route element={<RequireRole allow={['dpa']} />}>
          <Route element={<DpaDashboardLayout />}>
            <Route path="/dpa/dashboard" element={<DpaDashboard />} />
            <Route path="/dpa/mahasiswa" element={<DpaStudentList />} />
            <Route path="/dpa/mahasiswa/:id" element={<DpaStudentDetail />} />
            <Route path="/dpa/warnings" element={<DpaWarnings />} />
            <Route path="/dpa/laporan" element={<DpaLaporan />} />
            <Route path="/dpa/chat" element={<DpaGroupChat />} />
            <Route path="/dpa/bimbingan" element={<DpaBimbingan />} />
            <Route path="/dpa/profil" element={<DpaProfil />} />
          </Route>
        </Route>

        {/* Dashboard khusus Mahasiswa (student) */}
        <Route element={<RequireRole allow={['student']} />}>
          <Route element={<UserDashboardLayout />}>
            <Route path="/user/dashboard" element={<UserDashboard />} />
            <Route path="/user/kuisioner" element={<UserKuisioner />} />
            <Route path="/user/burnout/hasil" element={<BurnoutHasil />} />
            <Route path="/user/asesmen" element={<UserAsesmenHistory />} />
            <Route path="/user/happiness/assessment" element={<HappinessAssessment />} />
            <Route path="/user/happiness/index" element={<HappinessIndex />} />
            <Route path="/user/happiness/history" element={<HappinessHistory />} />
            <Route path="/user/well-being" element={<WellBeingComparison />} />
            <Route path="/user/faktor" element={<FaktorKondisi />} />
            <Route path="/user/rekomendasi" element={<Rekomendasi />} />
            <Route path="/user/grup-bimbingan" element={<StudentGroupChat />} />
            <Route path="/user/bimbingan" element={<BimbinganAkademik />} />
            <Route path="/user/dpa" element={<DpaDirectory />} />
            <Route path="/user/curhat" element={<UserCurhat />} />
            <Route path="/user/settings" element={<UserProfileSettings />} />
            <Route path="/user/network" element={<UserNetwork />} />
            <Route path="/user/film" element={<UserCinema />} />
            <Route path="/user/recovery" element={<UserRecoveryPlan />} />
            <Route path="/user/profile/:username" element={<UserProfilePage />} />
          </Route>
        </Route>

        {/* Dashboard Staf Kampus (pemrosesan laporan syarat UTS/UAS) */}
        <Route element={<RequireRole allow={['staff']} />}>
          <Route element={<StaffLayout />}>
            <Route path="/staff/dashboard" element={<StaffDashboard />} />
          </Route>
        </Route>

        {/* 404 — Catch All */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
