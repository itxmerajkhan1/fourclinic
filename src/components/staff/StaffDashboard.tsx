import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MailCheck,
  Menu,
  MessageSquare,
  RefreshCw,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateLabel, formatUserFriendlyError, todayIso } from '../../lib/validation';
import type { ClinicCatalogState } from '../../hooks/useClinicData';
import type { useAppointments } from '../../hooks/useAppointments';
import type { useStaffDashboard } from '../../hooks/useStaffDashboard';
import { OverviewTab, AppointmentsTab } from './OverviewAndAppointments';
import { DoctorsAndSchedulesTab } from './DoctorsAndSchedulesTab';
import { PatientsTab, InquiriesTab } from './PatientsAndInquiriesTabs';
import {
  AnalyticsTab,
  ServicesTab,
  SettingsAndAuditTab,
} from './ServicesAnalyticsSettingsTabs';

interface StaffDashboardProps {
  catalog: ClinicCatalogState;
  apptsApi: ReturnType<typeof useAppointments>;
  staffApi: ReturnType<typeof useStaffDashboard>;
  onExitToPublic: () => void;
  onToast: (msg: string) => void;
}

export function StaffDashboard({
  catalog,
  apptsApi,
  staffApi,
  onExitToPublic,
  onToast,
}: StaffDashboardProps) {
  const {
    user,
    profile,
    role,
    isAnonymousGuest,
    emailVerified,
    isStaff,
    signingIn,
    signInWithGoogle,
    signInWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    refreshUser,
    signOut,
  } = useAuth();
  const [tab, setTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Staff login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [staffAuthErr, setStaffAuthErr] = useState<string | null>(null);
  const [staffAuthInfo, setStaffAuthInfo] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  const isPermanentUser = Boolean(user && !isAnonymousGuest);

  if (!isPermanentUser || !emailVerified || !isStaff || role === 'public' || role === 'patient') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#D8DFD9] rounded-lg p-7 sm:p-8 shadow-sm space-y-5">
          <div className="text-center space-y-2 pb-4 border-b border-[#E6EAE4]">
            <div className="w-11 h-11 rounded-md bg-[#102E34] text-[#F7F5F0] mx-auto flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#C7775F]" />
            </div>
            <h1 className="font-editorial text-3xl text-[#102E34]">
              {!isPermanentUser
                ? 'Clinic Staff Workspace'
                : !emailVerified
                  ? 'Email Verification Required'
                  : 'Staff Access Required'}
            </h1>
            <p className="text-xs text-[#3B5257] leading-relaxed">
              {!isPermanentUser
                ? 'Sign in with an authorized Administrator, Receptionist, or Doctor account (Google or Email & Password).'
                : !emailVerified
                  ? `Signed in as ${user?.email}. Staff access requires a verified email address.`
                  : `Your account (${user?.email}) currently holds the "${role}" role and cannot access private clinic operations.`}
            </p>
          </div>

          {!isPermanentUser && (
            <div className="space-y-4">
              {!resetMode && (
                <>
                  <button
                    type="button"
                    disabled={authBusy || signingIn}
                    onClick={async () => {
                      setStaffAuthErr(null);
                      setStaffAuthInfo(null);
                      setAuthBusy(true);
                      try {
                        await signInWithGoogle();
                      } catch (err) {
                        setStaffAuthErr(formatUserFriendlyError(err, 'Google sign-in failed.'));
                      } finally {
                        setAuthBusy(false);
                      }
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-60 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{signingIn ? 'Signing in…' : 'Sign in with Google'}</span>
                  </button>

                  <div className="flex items-center gap-3 text-[11px] font-semibold text-[#5B7074] uppercase tracking-wider">
                    <span className="flex-1 h-px bg-[#E6EAE4]" />
                    <span>or staff email</span>
                    <span className="flex-1 h-px bg-[#E6EAE4]" />
                  </div>
                </>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setStaffAuthErr(null);
                  setStaffAuthInfo(null);
                  const cleanEmail = loginEmail.trim();
                  if (!cleanEmail || !cleanEmail.includes('@')) {
                    setStaffAuthErr('Please enter your staff email address.');
                    return;
                  }
                  if (resetMode) {
                    setAuthBusy(true);
                    try {
                      await sendPasswordReset(cleanEmail);
                      setStaffAuthInfo(
                        'Password reset link dispatched if an account matches that email.'
                      );
                    } catch (err) {
                      setStaffAuthErr(formatUserFriendlyError(err));
                    } finally {
                      setAuthBusy(false);
                    }
                    return;
                  }
                  if (loginPassword.length < 6) {
                    setStaffAuthErr('Please enter your password (6+ characters).');
                    return;
                  }
                  setAuthBusy(true);
                  try {
                    await signInWithEmail(cleanEmail, loginPassword);
                  } catch (err) {
                    setStaffAuthErr(formatUserFriendlyError(err));
                  } finally {
                    setAuthBusy(false);
                  }
                }}
                noValidate
                className="space-y-3"
              >
                <label className="block">
                  <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                    Staff email
                  </span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="staff@fourclinic.example"
                    autoComplete="email"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
                  />
                </label>

                {!resetMode && (
                  <label className="block">
                    <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                      Password
                    </span>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="current-password"
                        className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
                      />
                      <button
                        type="button"
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPwd((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#5B7074] cursor-pointer"
                      >
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </label>
                )}

                {staffAuthErr && (
                  <p
                    role="alert"
                    className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
                  >
                    {staffAuthErr}
                  </p>
                )}
                {staffAuthInfo && (
                  <p className="text-xs font-semibold text-[#1E6B4B] bg-[#E6F2EC] border border-[#B8DEC9] rounded-md p-3">
                    {staffAuthInfo}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-md bg-[#426F77] text-white text-sm font-semibold hover:bg-[#102E34] disabled:opacity-60 cursor-pointer"
                >
                  {resetMode ? <KeyRound className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                  <span>
                    {authBusy
                      ? 'Please wait…'
                      : resetMode
                        ? 'Send Reset Link'
                        : 'Sign in with Email'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setResetMode((v) => !v);
                    setStaffAuthErr(null);
                    setStaffAuthInfo(null);
                  }}
                  className="w-full text-xs font-semibold text-[#426F77] hover:text-[#102E34] hover:underline cursor-pointer"
                >
                  {resetMode ? '← Back to staff login' : 'Forgot password?'}
                </button>
              </form>
            </div>
          )}

          {isPermanentUser && !emailVerified && (
            <div className="space-y-2.5">
              {staffAuthErr && (
                <p
                  role="alert"
                  className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
                >
                  {staffAuthErr}
                </p>
              )}
              {staffAuthInfo && (
                <p className="text-xs font-semibold text-[#1E6B4B] bg-[#E6F2EC] border border-[#B8DEC9] rounded-md p-3">
                  {staffAuthInfo}
                </p>
              )}
              <button
                type="button"
                disabled={authBusy}
                onClick={async () => {
                  setAuthBusy(true);
                  setStaffAuthErr(null);
                  try {
                    const ok = await refreshUser();
                    if (!ok) {
                      setStaffAuthInfo(
                        'Email not verified yet. Open the verification email link first.'
                      );
                    }
                  } catch (err) {
                    setStaffAuthErr(formatUserFriendlyError(err));
                  } finally {
                    setAuthBusy(false);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh Verification Status</span>
              </button>
              <button
                type="button"
                disabled={authBusy}
                onClick={async () => {
                  setAuthBusy(true);
                  try {
                    await resendVerificationEmail();
                    setStaffAuthInfo(`Verification email re-sent to ${user?.email}.`);
                  } catch (err) {
                    setStaffAuthErr(formatUserFriendlyError(err));
                  } finally {
                    setAuthBusy(false);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-xs font-semibold text-[#102E34] cursor-pointer"
              >
                <MailCheck className="w-4 h-4 text-[#426F77]" />
                <span>Resend Verification Email</span>
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-[#E6EAE4] flex flex-col gap-2">
            {isPermanentUser && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-full py-2.5 rounded-md border border-[#D8DFD9] text-xs font-semibold text-[#3B5257] hover:bg-[#F7F5F0] cursor-pointer"
              >
                Sign out / Switch Account
              </button>
            )}
            <button
              type="button"
              onClick={onExitToPublic}
              className="w-full py-2.5 rounded-md border border-[#D8DFD9] text-sm font-semibold text-[#102E34] hover:bg-[#F7F5F0] cursor-pointer"
            >
              Return to Public Website
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'receptionist', 'doctor'] },
    { id: 'appointments', label: 'Appointments', icon: Calendar, roles: ['admin', 'receptionist', 'doctor'] },
    { id: 'doctors', label: 'Doctors & Schedules', icon: Stethoscope, roles: ['admin', 'receptionist', 'doctor'] },
    { id: 'patients', label: 'Patients', icon: Users, roles: ['admin', 'receptionist', 'doctor'] },
    { id: 'inquiries', label: 'Inquiries & CRM', icon: MessageSquare, roles: ['admin', 'receptionist'] },
    { id: 'services', label: 'Services & Pricing', icon: Wrench, roles: ['admin', 'receptionist'] },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'receptionist'] },
    { id: 'settings', label: 'Settings & Audit', icon: Settings, roles: ['admin', 'receptionist'] },
  ].filter((item) => item.roles.includes(role));

  const unreadInqCount = staffApi.inquiries.filter((q) => q.unread).length;
  const pendingCount = apptsApi.appointments.filter((a) => a.status === 'pending').length;
  const currentTabMeta = navItems.find((n) => n.id === tab) || navItems[0];

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col lg:flex-row">
      {/* Persistent Desktop Left Sidebar Rail */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col bg-[#102E34] text-[#F7F5F0] shrink-0 p-5 justify-between border-r border-[#194149]">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
            <span className="w-8 h-8 rounded-md bg-[#426F77] text-white flex items-center justify-center font-editorial text-xl">
              F
            </span>
            <div>
              <b className="block font-editorial text-2xl leading-none font-normal text-white">
                FourClinic
              </b>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-[#DCE8E3]/75 font-semibold">
                {role} workspace
              </span>
            </div>
          </div>

          <nav className="space-y-1" aria-label="Staff navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[13px] font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#DCE8E3] text-[#102E34]'
                      : 'text-[#DCE8E3]/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'appointments' && pendingCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold fc-tabular ${
                        active ? 'bg-[#102E34] text-[#F7F5F0]' : 'bg-[#C7775F] text-white'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                  {item.id === 'inquiries' && unreadInqCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold fc-tabular ${
                        active ? 'bg-[#102E34] text-[#F7F5F0]' : 'bg-[#C7775F] text-white'
                      }`}
                    >
                      {unreadInqCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-5 border-t border-white/10 space-y-2.5 text-xs">
          <div className="truncate text-[#DCE8E3]/80 pb-1">
            <b className="block text-white truncate">
              {profile?.displayName || user?.displayName || 'Staff'}
            </b>
            <span className="truncate block text-[11px]">{user?.email || profile?.email || ''}</span>
          </div>
          <button
            type="button"
            onClick={onExitToPublic}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Public Website</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              onExitToPublic();
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-white/15 text-[#DCE8E3]/85 hover:bg-white/10 font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Staff Header */}
      <div className="lg:hidden bg-[#102E34] text-[#F7F5F0] px-4 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Open staff menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-1.5 rounded-md bg-white/10 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div>
            <b className="font-editorial text-xl font-normal leading-none">FourClinic</b>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-[#DCE8E3]/80">
              {role}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onExitToPublic}
          className="px-3 py-1.5 rounded-md bg-white/10 text-xs font-semibold cursor-pointer"
        >
          Public Site
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#102E34] text-[#F7F5F0] px-4 pb-4 space-y-1 border-b border-white/10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                  active ? 'bg-[#DCE8E3] text-[#102E34]' : 'text-[#DCE8E3]/85'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Utility Topbar + Main Workspace Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden lg:flex h-[60px] bg-white border-b border-[#D8DFD9] px-8 items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 text-xs text-[#5B7074]">
            <span>FourClinic</span>
            <span>/</span>
            <b className="text-[#102E34] font-semibold">{currentTabMeta?.label}</b>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-[#5B7074] fc-tabular">{formatDateLabel(todayIso())}</span>
            <span className="px-2.5 py-1 rounded-sm bg-[#DCE8E3] text-[#102E34] font-semibold capitalize">
              {role}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {tab === 'overview' && (
            <OverviewTab
              role={role}
              doctorId={profile?.doctorId}
              appointments={apptsApi.appointments}
              doctors={catalog.doctors}
              inquiries={staffApi.inquiries}
              catalogSeeded={catalog.catalogSeeded}
              onConfirmAppt={(a) => apptsApi.updateAppointmentStatus(a, 'confirmed')}
              onGoToTab={setTab}
              onInitializeCatalog={catalog.initializeCatalog}
              onSeedSampleData={() =>
                staffApi.seedSampleDemoRecords(catalog.settings.slotDurationMins)
              }
              onToast={onToast}
            />
          )}

          {tab === 'appointments' && (
            <AppointmentsTab
              role={role}
              doctorId={profile?.doctorId}
              appointments={apptsApi.appointments}
              doctors={catalog.doctors}
              services={catalog.services}
              schedules={catalog.schedules}
              slotLocks={catalog.slotLocks}
              settings={catalog.settings}
              catalogSeeded={catalog.catalogSeeded}
              availabilityVerified={catalog.availabilityVerified}
              availabilityError={catalog.availabilityError}
              onRetryAvailability={catalog.retryAvailability}
              onBookAppointment={(input) =>
                apptsApi.bookAppointment(
                  input,
                  catalog.doctors,
                  catalog.services,
                  catalog.settings,
                  catalog.catalogSeeded,
                  catalog.schedules,
                  catalog.slotLocks,
                  catalog.availabilityVerified,
                  catalog.availabilityError
                )
              }
              onUpdateStatus={apptsApi.updateAppointmentStatus}
              onReschedule={(a, d, t, docObj) =>
                apptsApi.rescheduleAppointment(
                  a,
                  d,
                  t,
                  docObj,
                  catalog.settings,
                  catalog.schedules,
                  catalog.slotLocks,
                  catalog.availabilityVerified,
                  catalog.availabilityError
                )
              }
              onToast={onToast}
            />
          )}

          {tab === 'doctors' && (
            <DoctorsAndSchedulesTab
              role={role}
              linkedDoctorId={profile?.doctorId}
              doctors={catalog.doctors}
              schedules={catalog.schedules}
              appointments={apptsApi.appointments}
              onSaveDoctor={staffApi.saveDoctor}
              onSaveDoctorSchedule={staffApi.saveDoctorScheduleOnly}
              onAddOverride={staffApi.addScheduleOverride}
              onDeleteOverride={staffApi.deleteScheduleOverride}
              onToast={onToast}
            />
          )}

          {tab === 'patients' && (
            <PatientsTab
              role={role}
              patients={staffApi.patients}
              appointments={apptsApi.appointments}
              onUpdateNotes={staffApi.updatePatientNotes}
              onToast={onToast}
            />
          )}

          {tab === 'inquiries' && (
            <InquiriesTab
              inquiries={staffApi.inquiries}
              staffUsers={staffApi.usersList}
              onUpdateInquiry={staffApi.updateInquiry}
              onToast={onToast}
            />
          )}

          {tab === 'services' && (
            <ServicesTab
              role={role}
              services={catalog.services}
              doctors={catalog.doctors}
              slotDurationMins={catalog.settings.slotDurationMins}
              onSaveService={staffApi.saveService}
              onToast={onToast}
            />
          )}

          {tab === 'analytics' && (
            <AnalyticsTab
              appointments={apptsApi.appointments}
              inquiries={staffApi.inquiries}
              doctors={catalog.doctors}
              services={catalog.services}
            />
          )}

          {tab === 'settings' && (
            <SettingsAndAuditTab
              role={role}
              settings={catalog.settings}
              doctors={catalog.doctors}
              services={catalog.services}
              usersList={staffApi.usersList}
              auditLogs={staffApi.auditLogs}
              onSaveSettings={staffApi.saveClinicSettings}
              onUpdateUserRole={staffApi.updateUserRole}
              onToast={onToast}
            />
          )}
        </main>
      </div>
    </div>
  );
}
