import { useEffect, useState } from 'react';
import { Calendar, LogIn, LogOut, Menu, ShieldCheck, User, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface PublicNavbarProps {
  onOpenStaffDashboard: () => void;
  onOpenChat: () => void;
  myAppointmentsCount: number;
}

export function PublicNavbar({
  onOpenStaffDashboard,
  onOpenChat,
  myAppointmentsCount,
}: PublicNavbarProps) {
  const { user, role, isStaff, signingIn, signInWithGoogle, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const navLinks = [
    { href: '#services', label: 'Services' },
    { href: '#pricing', label: 'Prices' },
    { href: '#doctors', label: 'Doctors' },
    { href: '#reviews', label: 'Reviews' },
    { href: '#faq', label: 'FAQ' },
    { href: '#contact', label: 'Contact' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#e3ebec]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 h-[72px] flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5 text-[#12262e] font-extrabold text-xl tracking-tight shrink-0">
          <span className="w-9 h-9 rounded-xl bg-[#4d8a96] text-white flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3c-2.6 0-5 1.3-5 4.4 0 1.9 1.2 2.6 1.2 4.4 0 1.9-.6 5.2 1 6.7 1.3 1.3 1.9-2 2.8-2s1.5 3.3 2.8 2c1.6-1.5 1-4.8 1-6.7 0-1.8 1.2-2.5 1.2-4.4C17 4.3 14.6 3 12 3Z" />
            </svg>
          </span>
          <span>FourClinic</span>
        </a>

        <nav className="hidden lg:flex items-center gap-1 bg-[#f2f7f8] p-1 rounded-full border border-[#e3ebec]">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold text-[#42565c] hover:text-[#12262e] hover:bg-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          {isStaff && (
            <button
              type="button"
              onClick={onOpenStaffDashboard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#12262e] text-white text-xs font-bold hover:bg-[#1e3a45] transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#7cc2cf]" />
              <span>Staff ({role})</span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <a
                href="#my-visits"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold hover:bg-[#d7e6e9] transition whitespace-nowrap fc-tabular"
              >
                <User className="w-3.5 h-3.5" />
                <span>My Visits ({myAppointmentsCount})</span>
              </a>
              <button
                type="button"
                onClick={() => void signOut()}
                title={`Signed in as ${user.email}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-full border border-[#e3ebec] text-xs font-semibold text-[#42565c] hover:bg-[#f2f7f8] cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#cfdee1] text-xs font-bold text-[#12262e] hover:bg-[#f2f7f8] transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 text-[#4d8a96]" />
              <span>{signingIn ? 'Signing in…' : 'Sign in'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] transition shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book / AI Chat</span>
          </button>
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden p-2 rounded-xl border border-[#e3ebec] text-[#12262e] cursor-pointer"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-[#e3ebec] bg-white px-4 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2 rounded-xl bg-[#f2f7f8] text-center text-sm font-semibold text-[#12262e]"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[#eef3f4]">
            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenStaffDashboard();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#12262e] text-white text-xs font-bold cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#7cc2cf]" />
                <span>Staff Dashboard ({role})</span>
              </button>
            )}
            {user ? (
              <>
                <a
                  href="#my-visits"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold fc-tabular"
                >
                  My Visits ({myAppointmentsCount})
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut();
                  }}
                  className="px-4 py-2.5 rounded-full border border-[#e3ebec] text-xs font-bold text-[#42565c] cursor-pointer"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => {
                  setMobileOpen(false);
                  void signInWithGoogle();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full border border-[#cfdee1] text-xs font-bold text-[#12262e] cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-[#4d8a96]" />
                <span>{signingIn ? 'Signing in…' : 'Sign in with Google'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenChat();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#4d8a96] text-white text-xs font-bold cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>Book / Ask AI Receptionist</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
