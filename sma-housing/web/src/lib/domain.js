import { useMemo } from 'react';
import { useCollection } from '../api/queries';

/* Master data is a single table of typed lookup values with validity dates.
   Only rows that are active and currently in range should reach a dropdown. */
export function useMasterValues(type) {
  const { data: master = [] } = useCollection('master');
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return master
      .filter((m) => m.type === type && m.active !== false && m.active !== 0)
      .filter((m) => (!m.from || m.from <= today) && (!m.to || m.to >= today))
      .map((m) => m.value);
  }, [master, type]);
}

export function useStudentIndex() {
  const { data: students = [], isLoading } = useCollection('students');
  const byId = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  return {
    students,
    isLoading,
    byId,
    studentName: (id) => byId[id]?.name || id || '—'
  };
}

export function useBuildingIndex() {
  const { data: buildings = [] } = useCollection('buildings');
  const byId = useMemo(() => Object.fromEntries(buildings.map((b) => [b.id, b])), [buildings]);
  return { buildings, byId, buildingName: (id) => byId[id]?.name || id || '—' };
}

/* A movement is overdue when the student left, was expected back by now, and
   has not returned. Drives the dashboard alert and the gate log highlight. */
export const isOverdue = (m) =>
  m.type === 'Exit' && !m.returnedAt && m.expectedReturn && new Date(m.expectedReturn) < new Date();

export const openMovements = (movements) =>
  movements.filter((m) => m.type === 'Exit' && !m.returnedAt);

export const ATTENDANCE_FALLBACK = ['Present', 'Absent', 'Hospital', 'Official Leave', 'Weekend Leave', 'Unknown'];
