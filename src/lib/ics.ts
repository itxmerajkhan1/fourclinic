import type { Appointment } from '../types/clinic';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function icsStamp(date: Date): string {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

export function downloadAppointmentIcs(
  appt: Pick<Appointment, 'id' | 'referenceCode' | 'serviceName' | 'doctorName' | 'date' | 'time' | 'durationMins'>,
  clinicAddress: string
): void {
  const [y, m, d] = appt.date.split('-').map(Number);
  const [hh, mm] = appt.time.split(':').map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0);
  const end = new Date(start.getTime() + (appt.durationMins || 30) * 60000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FourClinic//Appointment//EN',
    'BEGIN:VEVENT',
    `UID:${appt.id}@fourclinic`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${appt.serviceName} — FourClinic`,
    `DESCRIPTION:Reference ${appt.referenceCode} with ${appt.doctorName}.`,
    `LOCATION:${clinicAddress}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${appt.referenceCode || 'fourclinic-visit'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
