import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_CLINIC_SETTINGS,
  SAMPLE_DOCTORS,
  SAMPLE_SERVICES,
} from '../data/sampleSeed';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  BusySlot,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
} from '../types/clinic';

export interface ClinicCatalogState {
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: BusySlot[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  loading: boolean;
  availabilityVerified: boolean;
  availabilityLoading: boolean;
  availabilityError: string | null;
  retryAvailability: () => void;
  initializeCatalog: () => Promise<void>;
}

function logAvailabilityDiagnostic(err: unknown, path: string) {
  const errInfo = {
    error: err instanceof Error ? err.message : String(err),
    operationType: OperationType.LIST,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
  };
  console.error('Firestore availability error: ', JSON.stringify(errInfo));
}

function formatAvailabilityListenerError(err: unknown, target: 'busySlots' | 'schedules'): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const msg = err instanceof Error ? err.message : String(err);
  const lower = `${code} ${msg}`.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('insufficient')) {
    return target === 'busySlots'
      ? 'Live slot availability could not be verified from Firestore (missing busySlots read permission). Publish the updated firestore.rules before accepting bookings.'
      : 'Doctor schedule overrides could not be verified from Firestore (missing schedules read permission). Publish the updated firestore.rules before accepting bookings.';
  }
  return 'Live appointment availability could not be verified from Firestore right now. Booking is blocked until availability is confirmed.';
}

export function useClinicData(): ClinicCatalogState {
  const { role, authReady } = useAuth();
  const [fsDoctors, setFsDoctors] = useState<Doctor[]>([]);
  const [fsServices, setFsServices] = useState<ServiceItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOverride[]>([]);
  const [slotLocks, setSlotLocks] = useState<BusySlot[]>([]);
  const [fsSettings, setFsSettings] = useState<ClinicSettings | null>(null);
  const [loadedFlags, setLoadedFlags] = useState({
    doctors: false,
    services: false,
    schedules: false,
    busySlots: false,
    settings: false,
  });
  const [busySlotsError, setBusySlotsError] = useState<string | null>(null);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const seededTriggered = useRef(false);

  const retryAvailability = useCallback(() => {
    setBusySlotsError(null);
    setSchedulesError(null);
    setLoadedFlags((f) => ({ ...f, schedules: false, busySlots: false }));
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const unsubDocs = onSnapshot(
      collection(db, 'doctors'),
      (snap) => {
        setFsDoctors(snap.docs.map((d) => d.data() as Doctor));
        setLoadedFlags((f) => ({ ...f, doctors: true }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'doctors')
    );

    const unsubSvcs = onSnapshot(
      collection(db, 'services'),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ServiceItem)
          .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
        setFsServices(items);
        setLoadedFlags((f) => ({ ...f, services: true }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'services')
    );

    const unsubSched = onSnapshot(
      collection(db, 'schedules'),
      (snap) => {
        setSchedules(snap.docs.map((d) => d.data() as ScheduleOverride));
        setSchedulesError(null);
        setLoadedFlags((f) => ({ ...f, schedules: true }));
      },
      (err) => {
        logAvailabilityDiagnostic(err, 'schedules');
        setSchedules([]);
        setLoadedFlags((f) => ({ ...f, schedules: false }));
        setSchedulesError(formatAvailabilityListenerError(err, 'schedules'));
      }
    );

    const unsubLocks = onSnapshot(
      collection(db, 'busySlots'),
      (snap) => {
        setSlotLocks(snap.docs.map((d) => d.data() as BusySlot));
        setBusySlotsError(null);
        setLoadedFlags((f) => ({ ...f, busySlots: true }));
      },
      (err) => {
        logAvailabilityDiagnostic(err, 'busySlots');
        setSlotLocks([]);
        setLoadedFlags((f) => ({ ...f, busySlots: false }));
        setBusySlotsError(formatAvailabilityListenerError(err, 'busySlots'));
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'clinicSettings', 'main'),
      (snap) => {
        setFsSettings(snap.exists() ? (snap.data() as ClinicSettings) : null);
        setLoadedFlags((f) => ({ ...f, settings: true }));
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'clinicSettings/main')
    );

    return () => {
      unsubDocs();
      unsubSvcs();
      unsubSched();
      unsubLocks();
      unsubSettings();
    };
  }, [retryNonce]);

  const initializeCatalog = useCallback(async () => {
    try {
      await runTransaction(db, async (tx) => {
        const settingsRef = doc(db, 'clinicSettings', 'main');
        const doctorRefs = SAMPLE_DOCTORS.map((d) => ({
          data: d,
          ref: doc(db, 'doctors', d.id),
        }));
        const serviceRefs = SAMPLE_SERVICES.map((s) => ({
          data: s,
          ref: doc(db, 'services', s.id),
        }));

        // All reads before writes inside transaction (prevents duplicate/overwrite across concurrent tabs)
        const settingsSnap = await tx.get(settingsRef);
        const doctorSnaps = await Promise.all(doctorRefs.map((item) => tx.get(item.ref)));
        const serviceSnaps = await Promise.all(serviceRefs.map((item) => tx.get(item.ref)));

        const now = serverTimestamp();

        if (!settingsSnap.exists()) {
          tx.set(settingsRef, {
            ...DEFAULT_CLINIC_SETTINGS,
            updatedAt: now,
          });
        }

        doctorRefs.forEach((item, idx) => {
          if (!doctorSnaps[idx].exists()) {
            tx.set(item.ref, {
              ...item.data,
              createdAt: now,
              updatedAt: now,
            });
          }
        });

        serviceRefs.forEach((item, idx) => {
          if (!serviceSnaps[idx].exists()) {
            tx.set(item.ref, {
              ...item.data,
              createdAt: now,
              updatedAt: now,
            });
          }
        });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'catalog_init');
    }
  }, []);

  // Automatically initialize clinic catalog in Firestore once when an Admin connects to an empty catalog
  useEffect(() => {
    if (
      authReady &&
      role === 'admin' &&
      loadedFlags.doctors &&
      loadedFlags.services &&
      loadedFlags.settings &&
      (fsDoctors.length === 0 || fsServices.length === 0 || !fsSettings) &&
      !seededTriggered.current
    ) {
      seededTriggered.current = true;
      void initializeCatalog();
    }
  }, [authReady, role, loadedFlags, fsDoctors.length, fsServices.length, fsSettings, initializeCatalog]);

  const catalogSeeded = fsDoctors.length > 0 && fsServices.length > 0;
  const doctors = fsDoctors.length > 0 ? fsDoctors : SAMPLE_DOCTORS;
  const services = fsServices.length > 0 ? fsServices : SAMPLE_SERVICES;
  const settings = fsSettings || DEFAULT_CLINIC_SETTINGS;
  const loading = !(loadedFlags.doctors && loadedFlags.services && loadedFlags.settings);
  const availabilityError = busySlotsError || schedulesError || null;
  const availabilityVerified =
    !availabilityError &&
    loadedFlags.doctors &&
    loadedFlags.services &&
    loadedFlags.settings &&
    loadedFlags.schedules &&
    loadedFlags.busySlots;
  const availabilityLoading = !availabilityError && !availabilityVerified;

  return {
    doctors,
    services,
    schedules,
    slotLocks,
    settings,
    catalogSeeded,
    loading,
    availabilityVerified,
    availabilityLoading,
    availabilityError,
    retryAvailability,
    initializeCatalog,
  };
}
