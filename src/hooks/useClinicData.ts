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
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
  SlotLock,
} from '../types/clinic';

export interface ClinicCatalogState {
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: SlotLock[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  loading: boolean;
  initializeCatalog: () => Promise<void>;
}

export function useClinicData(): ClinicCatalogState {
  const { role, authReady } = useAuth();
  const [fsDoctors, setFsDoctors] = useState<Doctor[]>([]);
  const [fsServices, setFsServices] = useState<ServiceItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOverride[]>([]);
  const [slotLocks, setSlotLocks] = useState<SlotLock[]>([]);
  const [fsSettings, setFsSettings] = useState<ClinicSettings | null>(null);
  const [loadedFlags, setLoadedFlags] = useState({
    doctors: false,
    services: false,
    settings: false,
  });
  const seededTriggered = useRef(false);

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
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
    );

    const unsubLocks = onSnapshot(
      collection(db, 'slotLocks'),
      (snap) => {
        setSlotLocks(snap.docs.map((d) => d.data() as SlotLock));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'slotLocks')
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
  }, []);

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

  return {
    doctors,
    services,
    schedules,
    slotLocks,
    settings,
    catalogSeeded,
    loading,
    initializeCatalog,
  };
}
