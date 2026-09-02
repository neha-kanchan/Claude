import { useMemo } from 'react';
import { useCollection } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { makeCan, isAdminRole, defaultPerms } from './perms';

/* Role rows drive both the navigation and the per-button checks. A role stored
   without permissions falls back to the same defaults the server seeds, so a
   fresh install is never locked out of its own UI. */
export function usePermissions() {
  const { user } = useAuth();
  const { data: roles = [], isLoading } = useCollection('roles', { enabled: !!user });

  return useMemo(() => {
    const normalised = roles.map((r) =>
      r.perms === 'ALL' || (r.perms && Object.keys(r.perms).length)
        ? r
        : { ...r, perms: defaultPerms(r.name) });
    return {
      can: makeCan(user, normalised),
      isAdmin: isAdminRole(user, normalised),
      roles: normalised,
      isLoading
    };
  }, [user, roles, isLoading]);
}
