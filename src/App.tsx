import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAppointments } from './hooks/useAppointments';
import { useClinicData } from './hooks/useClinicData';
import { useStaffDashboard } from './hooks/useStaffDashboard';
import { formatUserFriendlyError } from './lib/validation';
import { PublicNavbar } from './components/public/PublicNavbar';
import { HeroAndGallery } from './components/public/HeroAndGallery';
import { ServicesAndPricing } from './components/public/ServicesAndPricing';
import { HowItWorksAndDoctors } from './components/public/HowItWorksAndDoctors';
import { BookingAndPatientPortal } from './components/public/BookingAndPatientPortal';
import { ContactAndFooter } from './components/public/ContactAndFooter';
import { ChatWidget } from './components/public/ChatWidget';
import { StaffDashboard } from './components/staff/StaffDashboard';

function FourClinicApp() {
  const { authError, clearAuthError } = useAuth();
  const catalog = useClinicData();
  const apptsApi = useAppointments();
  const staffApi = useStaffDashboard();

  const [staffView, setStaffView] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    (window.location.pathname === '/staff' || window.location.pathname === '/admin')
  );
  const [chatOpen, setChatOpen] = useState(false);
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

  useEffect(() => {
    if (authError) {
      showToast(formatUserFriendlyError(authError));
      clearAuthError();
    }
  }, [authError, clearAuthError, showToast]);

  // Keep staffView synced on browser back/forward navigation
  useEffect(() => {
    const onPop = () => {
      setStaffView(window.location.pathname === '/staff' || window.location.pathname === '/admin');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function openStaffPortal() {
    setStaffView(true);
    window.history.pushState({}, '', '/staff');
    window.scrollTo({ top: 0 });
  }

  function exitToPublic() {
    setStaffView(false);
    window.history.pushState({}, '', '/');
    window.scrollTo({ top: 0 });
  }

  function jumpToBooking(serviceId: string, doctorId = '', date = '') {
    if (serviceId) setPrefillServiceId(serviceId);
    if (doctorId) setPrefillDoctorId(doctorId);
    if (date) setPrefillDate(date);
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      {staffView ? (
        <StaffDashboard
          catalog={catalog}
          apptsApi={apptsApi}
          staffApi={staffApi}
          onExitToPublic={exitToPublic}
          onToast={showToast}
        />
      ) : (
        <div className="min-h-screen bg-white text-[#12262e]">
          <PublicNavbar
            onOpenStaffDashboard={openStaffPortal}
            onOpenChat={() => setChatOpen(true)}
            myAppointmentsCount={apptsApi.appointments.length}
          />

          <main>
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
                  catalog.slotLocks
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
                  catalog.slotLocks
                )
              }
              onOpenChat={() => setChatOpen(true)}
              onToast={showToast}
            />

            <ContactAndFooter
              settings={catalog.settings}
              onSubmitInquiry={staffApi.submitInquiry}
              onOpenChat={() => setChatOpen(true)}
              onToast={showToast}
            />
          </main>

          <ChatWidget
            open={chatOpen}
            onToggle={setChatOpen}
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
            onPrefillBooking={(svcId, docId, date) => jumpToBooking(svcId, docId, date)}
            onEscalateInquiry={staffApi.submitInquiry}
            onToast={showToast}
          />
        </div>
      )}

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full bg-[#12262e] text-white text-xs sm:text-sm font-bold shadow-2xl max-w-[90vw] text-center"
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
