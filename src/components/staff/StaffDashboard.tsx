import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Stethoscope,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
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
  const { user, profile, role, isStaff, signInWithGoogle, signOut } = useAuth();
  const [tab, setTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  if (!user || !isStaff || role === 'public' || role === 'patient') {
    return (
      <div className="min-h-screen bg-[#f4f8f8] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#e3ebec] rounded-3xl p-7 text-center shadow-lg">
          <h1 className="text-xl font-extrabold text-[#12262e]">Staff Portal Access Required</h1>
          <p className="mt-2 text-sm text-[#42565c]">
            {!user
              ? 'Sign in with an authorized clinic staff Google account (Admin, Receptionist, or Doctor) to access the management dashboard.'
              : `Your account (${user.email}) currently holds the "${role}" role and does not have access to private clinic records.`}
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {!user && (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="w-full py-3 rounded-full bg-[#4d8a96] text-white text-sm font-bold hover:bg-[#3d7280] cursor-pointer"
              >
                Sign in with Google
              </button>
            )}
            <button
              type="button"
              onClick={onExitToPublic}
              className="w-full py-3 rounded-full border border-[#cfdee1] text-sm font-bold text-[#12262e] hover:bg-[#f2f7f8] cursor-pointer"
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

  return (
    <div className="min-h-screen bg-[#f4f8f8] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#12262e] text-white shrink-0 p-5 justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#4d8a96] flex items-center justify-center font-extrabold">
              F
            </span>
            <div>
              <b className="block text-base font-extrabold leading-tight">FourClinic</b>
              <span className="text-[11px] uppercase tracking-wider text-[#7cc2cf] font-bold">
                {role} portal
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#4d8a96] text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'appointments' && pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-[#12262e] text-[10px] font-extrabold fc-tabular">
                      {pendingCount}
                    </span>
                  )}
                  {item.id === 'inquiries' && unreadInqCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-400 text-[#12262e] text-[10px] font-extrabold fc-tabular">
                      {unreadInqCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-5 border-t border-white/10 space-y-3 text-xs">
          <div className="truncate text-white/80">
            <b className="block text-white truncate">{profile?.displayName || user.displayName}</b>
            <span className="truncate block">{user.email}</span>
          </div>
          <button
            type="button"
            onClick={onExitToPublic}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-bold cursor-pointer"
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
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 text-white/80 hover:bg-white/10 font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden bg-[#12262e] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Open staff menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg bg-white/10 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <b className="text-sm font-extrabold">FourClinic ({role})</b>
        </div>
        <button
          type="button"
          onClick={onExitToPublic}
          className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-bold cursor-pointer"
        >
          Public Site
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#12262e] text-white px-4 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer ${
                  tab === item.id ? 'bg-[#4d8a96]' : 'text-white/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
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
            onBookAppointment={(input) =>
              apptsApi.bookAppointment(
                input,
                catalog.doctors,
                catalog.services,
                catalog.settings,
                catalog.catalogSeeded,
                catalog.schedules,
                catalog.slotLocks
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
                catalog.slotLocks
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
            usersList={staffApi.usersList}
            auditLogs={staffApi.auditLogs}
            onSaveSettings={staffApi.saveClinicSettings}
            onUpdateUserRole={staffApi.updateUserRole}
            onToast={onToast}
          />
        )}
      </main>
    </div>
  );
}
