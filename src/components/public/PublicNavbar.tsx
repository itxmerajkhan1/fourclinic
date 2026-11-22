import { useEffect, useState } from 'react';
import { Calendar, LogIn, LogOut, MailWarning, Menu, ShieldCheck, User, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface PublicNavbarProps {
  currentRoute: 'home' | 'my-visits' | 'staff';
  onNavigateSection: (sectionId?: string) => void;
  onOpenMyVisits: () => void;
  onOpenStaffDashboard: () => void;
  onOpenAuthModal: (mode?: 'signin' | 'signup') => void;
  onOpenChat: () => void;
  myAppointmentsCount: number;
}

export function PublicNavbar({
  currentRoute,
  onNavigateSection,
  onOpenMyVisits,
  onOpenStaffDashboard,
  onOpenAuthModal,
  onOpenChat,
  myAppointmentsCount,
}: PublicNavbarProps) {
  const { user, role, isStaff, isAnonymousGuest, emailVerified, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const navLinks: Array<{ id: string; label: string; isVisits?: boolean }> = [
    { id: 'services', label: 'Treatments' },
    { id: 'pricing', label: 'Fees' },
    { id: 'doctors', label: 'Doctors' },
    { id: 'book', label: 'Book' },
    { id: 'my-visits', label: 'My Visits', isVisits: true },
    { id: 'contact', label: 'Contact' },
  ];

  function handleNavClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    link: { id: string; isVisits?: boolean }
  ) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setMobileOpen(false);
    if (link.isVisits) {
      onOpenMyVisits();
    } else {
      onNavigateSection(link.id);
    }
  }

  const isPermanentUser = Boolean(user && !isAnonymousGuest);

  return (
    <header className="sticky top-0 z-40 bg-[#F7F5F0]/95 backdrop-blur-md border-b border-[#D8DFD9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 h-[68px] flex items-center justify-between gap-4">
        <a
          href="/#top"
          onClick={(e) => handleNavClick(e, { id: 'top' })}
          className="flex items-center gap-2.5 text-[#102E34] shrink-0 group"
        >
          <span className="w-8 h-8 rounded-md bg-[#102E34] text-[#F7F5F0] flex items-center justify-center transition-colors group-hover:bg-[#426F77]">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3c-2.6 0-5 1.3-5 4.4 0 1.9 1.2 2.6 1.2 4.4 0 1.9-.6 5.2 1 6.7 1.3 1.3 1.9-2 2.8-2s1.5 3.3 2.8 2c1.6-1.5 1-4.8 1-6.7 0-1.8 1.2-2.5 1.2-4.4C17 4.3 14.6 3 12 3Z" />
            </svg>
          </span>
          <span className="font-editorial text-[26px] leading-none tracking-tight text-[#102E34]">
            FourClinic
          </span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-7"
        >
          {navLinks.map((link) => {
            const active = link.isVisits && currentRoute === 'my-visits';
            return (
              <a
                key={link.id}
                href={link.isVisits ? '/my-visits' : `/#${link.id}`}
                onClick={(e) => handleNavClick(e, link)}
                className={`relative py-1 text-[13px] font-semibold tracking-wide transition-colors whitespace-nowrap ${
                  active
                    ? 'text-[#102E34]'
                    : 'text-[#3B5257] hover:text-[#102E34]'
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-0.5 h-[1.5px] bg-[#102E34]" />
                )}
              </a>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          {isStaff && (
            <button
              type="button"
              onClick={onOpenStaffDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#102E34]/20 bg-[#DCE8E3] text-[#102E34] text-xs font-semibold hover:bg-[#cde0d8] transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#102E34]" />
              <span className="capitalize">{role} Portal</span>
            </button>
          )}

          {isPermanentUser ? (
            <div className="flex items-center gap-2">
              {!emailVerified && (
                <button
                  type="button"
                  onClick={() => onOpenAuthModal('signin')}
                  title="Verify your email address"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#FCF4E6] border border-[#E5C994] text-[#8F5310] text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <MailWarning className="w-3.5 h-3.5" />
                  <span>Verify email</span>
                </button>
              )}
              <a
                href="/my-visits"
                onClick={(e) => handleNavClick(e, { id: 'my-visits', isVisits: true })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] text-xs font-semibold hover:border-[#426F77] transition whitespace-nowrap fc-tabular"
              >
                <User className="w-3.5 h-3.5 text-[#426F77]" />
                <span>Visits ({myAppointmentsCount})</span>
              </a>
              <button
                type="button"
                onClick={() => void signOut()}
                title={`Signed in as ${user?.email || ''}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#D8DFD9] text-xs font-medium text-[#3B5257] hover:bg-white cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {myAppointmentsCount > 0 && (
                <a
                  href="/my-visits"
                  onClick={(e) => handleNavClick(e, { id: 'my-visits', isVisits: true })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] text-xs font-semibold hover:border-[#426F77] transition whitespace-nowrap fc-tabular"
                >
                  <User className="w-3.5 h-3.5 text-[#426F77]" />
                  <span>Guest Visits ({myAppointmentsCount})</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onOpenAuthModal('signin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#426F77] transition cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 text-[#426F77]" />
                <span>Sign in</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#1A434B] transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Calendar className="w-3.5 h-3.5 text-[#C7775F]" />
            <span>Ask AI Chat</span>
          </button>
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden p-2 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] cursor-pointer"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-[#D8DFD9] bg-[#F7F5F0] px-4 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {navLinks.map((link) => {
              const active = link.isVisits && currentRoute === 'my-visits';
              return (
                <a
                  key={link.id}
                  href={link.isVisits ? '/my-visits' : `/#${link.id}`}
                  onClick={(e) => handleNavClick(e, link)}
                  className={`px-3 py-2.5 rounded-md text-center text-xs font-semibold border transition ${
                    active
                      ? 'bg-[#102E34] text-[#F7F5F0] border-[#102E34]'
                      : 'bg-white text-[#102E34] border-[#D8DFD9]'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-[#D8DFD9]">
            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenStaffDashboard();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-[#DCE8E3] border border-[#102E34]/20 text-[#102E34] text-xs font-semibold cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="capitalize">Staff ({role})</span>
              </button>
            )}
            {isPermanentUser ? (
              <>
                <a
                  href="/my-visits"
                  onClick={(e) => handleNavClick(e, { id: 'my-visits', isVisits: true })}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-white border border-[#D8DFD9] text-[#102E34] text-xs font-semibold fc-tabular"
                >
                  My Visits ({myAppointmentsCount})
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut();
                  }}
                  className="px-4 py-2.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#3B5257] cursor-pointer"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAuthModal('signin');
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-[#426F77]" />
                <span>Sign in / Sign up</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenChat();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-[#C7775F]" />
              <span>Book / Ask AI Receptionist</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
