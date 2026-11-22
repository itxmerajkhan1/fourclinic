import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAppointments } from './hooks/useAppointments';
import { useClinicData } from './hooks/useClinicData';
import { useStaffDashboard } from './hooks/useStaffDashboard';
import { formatUserFriendlyError } from './lib/validation';
import { AuthModal, type AuthModalMode } from './components/auth/AuthModal';
import { PublicNavbar } from './components/public/PublicNavbar';
import { HeroAndGallery } from './components/public/HeroAndGallery';
import { ServicesAndPricing } from './components/public/ServicesAndPricing';
import { HowItWorksAndDoctors } from './components/public/HowItWorksAndDoctors';
import { BookingAndPatientPortal } from './components/public/BookingAndPatientPortal';
import { ContactAndFooter } from './components/public/ContactAndFooter';
import { ChatWidget } from './components/public/ChatWidget';
import { MyVisitsPage } from './components/public/MyVisitsPage';
import { StaffDashboard } from './components/staff/StaffDashboard';

type AppRoute = 'home' | 'my-visits' | 'staff';

function resolveRouteFromPath(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/staff' || normalized === '/admin') return 'staff';
  if (normalized === '/my-visits') return 'my-visits';
  return 'home';
}

function FourClinicApp() {
  const { authError, clearAuthError } = useAuth();
  const catalog = useClinicData();
  const apptsApi = useAppointments();
  const staffApi = useStaffDashboard();

  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? resolveRouteFromPath(window.location.pathname) : 'home'
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signin');
  const [prefillServiceId, setPrefillServiceId] = useState('');
  const [prefillDoctorId, setPrefillDoctorId] = useState('');
  const [prefillDate, setPrefillDate] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 4500);
  }, []);

  const openAuthModal = useCallback((mode: AuthModalMode = 'signin') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    if (authError) {
      showToast(formatUserFriendlyError(authError));
      clearAuthError();
    }
  }, [authError, clearAuthError, showToast]);

  // Keep route synced on browser back/forward navigation
  useEffect(() => {
    const onPop = () => {
      setRoute(resolveRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateHomeSection = useCallback((sectionId?: string) => {
    const targetUrl = sectionId && sectionId !== 'top' ? `/#${sectionId}` : '/';
    if (
      window.location.pathname !== '/' ||
      window.location.hash !== (sectionId ? `#${sectionId}` : '')
    ) {
      window.history.pushState({}, '', targetUrl);
    }
    setRoute('home');
    if (!sectionId || sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }, []);

  const openMyVisits = useCallback(() => {
    setRoute('my-visits');
    if (window.location.pathname !== '/my-visits') {
      window.history.pushState({}, '', '/my-visits');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const openStaffPortal = useCallback(() => {
    setRoute('staff');
    if (window.location.pathname !== '/staff') {
      window.history.pushState({}, '', '/staff');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const exitToPublic = useCallback(() => {
    setRoute('home');
    window.history.pushState({}, '', '/');
    window.scrollTo({ top: 0 });
  }, []);

  function jumpToBooking(serviceId: string, doctorId = '', date = '') {
    if (serviceId) setPrefillServiceId(serviceId);
    if (doctorId) setPrefillDoctorId(doctorId);
    if (date) setPrefillDate(date);
    navigateHomeSection('book');
  }

  return (
    <>
      {route === 'staff' ? (
        <StaffDashboard
          catalog={catalog}
          apptsApi={apptsApi}
          staffApi={staffApi}
          onExitToPublic={exitToPublic}
          onToast={showToast}
        />
      ) : (
        <div className="min-h-screen bg-[#F7F5F0] text-[#102E34] flex flex-col">
          <PublicNavbar
            currentRoute={route}
            onNavigateSection={navigateHomeSection}
            onOpenMyVisits={openMyVisits}
            onOpenStaffDashboard={openStaffPortal}
            onOpenAuthModal={openAuthModal}
            onOpenChat={() => setChatOpen(true)}
            myAppointmentsCount={apptsApi.appointments.length}
          />

          <main className="flex-1">
            {route === 'my-visits' ? (
              <MyVisitsPage
                doctors={catalog.doctors}
                schedules={catalog.schedules}
                slotLocks={catalog.slotLocks}
                settings={catalog.settings}
                availabilityVerified={catalog.availabilityVerified}
                availabilityError={catalog.availabilityError}
                onRetryAvailability={catalog.retryAvailability}
                myAppointments={apptsApi.appointments}
                myInquiries={staffApi.inquiries}
                appointmentsLoading={apptsApi.loading}
                onCancelAppointment={(appt) =>
                  apptsApi.updateAppointmentStatus(appt, 'cancelled')
                }
                onRescheduleAppointment={(appt, newDate, newTime, doctor) =>
                  apptsApi.rescheduleAppointment(
                    appt,
                    newDate,
                    newTime,
                    doctor,
                    catalog.settings,
                    catalog.schedules,
                    catalog.slotLocks,
                    catalog.availabilityVerified,
                    catalog.availabilityError
                  )
                }
                onLookupVisitBySecret={apptsApi.lookupVisitBySecret}
                onOpenAuthModal={openAuthModal}
                onBackToBooking={() => navigateHomeSection('book')}
                onOpenChat={() => setChatOpen(true)}
                onToast={showToast}
              />
            ) : (
              <>
                <HeroAndGallery
                  services={catalog.services}
                  doctors={catalog.doctors}
                  settings={catalog.settings}
                  onQuickSearch={(svcId, date) => jumpToBooking(svcId, '', date)}
                  onOpenChat={() => setChatOpen(true)}
                />

                <ServicesAndPricing
                  services={catalog.services}
                  onBookService={(svcId) => jumpToBooking(svcId)}
                />

                <HowItWorksAndDoctors
                  doctors={catalog.doctors}
                  services={catalog.services}
                  onBookDoctor={(docId, svcId) => jumpToBooking(svcId, docId)}
                  onOpenChat={() => setChatOpen(true)}
                />

                <BookingAndPatientPortal
                  doctors={catalog.doctors}
                  services={catalog.services}
                  schedules={catalog.schedules}
                  slotLocks={catalog.slotLocks}
                  settings={catalog.settings}
                  catalogSeeded={catalog.catalogSeeded}
                  catalogLoading={catalog.loading}
                  availabilityVerified={catalog.availabilityVerified}
                  availabilityError={catalog.availabilityError}
                  onRetryAvailability={catalog.retryAvailability}
                  prefillServiceId={prefillServiceId}
                  prefillDoctorId={prefillDoctorId}
                  prefillDate={prefillDate}
                  myAppointments={apptsApi.appointments}
                  appointmentsLoading={apptsApi.loading}
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
                  onCancelAppointment={(appt) =>
                    apptsApi.updateAppointmentStatus(appt, 'cancelled')
                  }
                  onRescheduleAppointment={(appt, newDate, newTime, doctor) =>
                    apptsApi.rescheduleAppointment(
                      appt,
                      newDate,
                      newTime,
                      doctor,
                      catalog.settings,
                      catalog.schedules,
                      catalog.slotLocks,
                      catalog.availabilityVerified,
                      catalog.availabilityError
                    )
                  }
                  onOpenAuthModal={openAuthModal}
                  onOpenMyVisits={openMyVisits}
                  onOpenChat={() => setChatOpen(true)}
                  onToast={showToast}
                />

                <ContactAndFooter
                  settings={catalog.settings}
                  onSubmitInquiry={staffApi.submitInquiry}
                  onOpenChat={() => setChatOpen(true)}
                  onNavigateSection={navigateHomeSection}
                  onOpenMyVisits={openMyVisits}
                  onOpenStaffDashboard={openStaffPortal}
                  onToast={showToast}
                />
              </>
            )}
          </main>

          {route === 'my-visits' && (
            <footer className="bg-[#102E34] text-[#F7F5F0] py-8 border-t border-white/10">
              <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#DCE8E3]/80">
                <span>
                  © {new Date().getFullYear()} FourClinic. Fictional portfolio clinic demonstration.
                </span>
                <div className="flex items-center gap-5 font-medium">
                  <button
                    type="button"
                    onClick={() => navigateHomeSection('top')}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHomeSection('book')}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Book Appointment
                  </button>
                  <button
                    type="button"
                    onClick={openStaffPortal}
                    className="hover:text-white underline underline-offset-4 transition cursor-pointer"
                  >
                    Staff Portal
                  </button>
                </div>
              </div>
            </footer>
          )}

          <ChatWidget
            open={chatOpen}
            onToggle={setChatOpen}
            doctors={catalog.doctors}
            services={catalog.services}
            schedules={catalog.schedules}
            slotLocks={catalog.slotLocks}
            settings={catalog.settings}
            catalogSeeded={catalog.catalogSeeded}
            availabilityVerified={catalog.availabilityVerified}
            availabilityError={catalog.availabilityError}
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
            onPrefillBooking={(svcId, docId, date) => jumpToBooking(svcId, docId, date)}
            onEscalateInquiry={staffApi.submitInquiry}
            onToast={showToast}
          />

          <AuthModal
            open={authModalOpen}
            initialMode={authModalMode}
            onClose={() => setAuthModalOpen(false)}
            onToast={showToast}
          />
        </div>
      )}

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-lg bg-[#102E34] text-[#F7F5F0] border border-[#426F77] text-xs sm:text-sm font-medium shadow-xl max-w-[90vw] text-center"
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FourClinicApp />
    </AuthProvider>
  );
}
