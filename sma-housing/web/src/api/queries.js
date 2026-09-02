/* The data layer.

   Every read is a query keyed by [env, collection], so switching between
   Production and Non-Production swaps datasets without any manual cache
   clearing. Every write is a mutation against a single record - the server's
   per-record REST routes - and invalidates just that collection. Nothing here
   ever sends a whole collection, which is what used to let two people
   overwrite each other. */

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { request, getEnv, toList, DOC_COLLECTIONS } from './client';
import { useEnv } from '../auth/AuthContext';

export const collectionKey = (env, collection) => [env, collection];

export function useCollection(collection, options = {}) {
  const env = useEnv();
  return useQuery({
    queryKey: collectionKey(env, collection),
    queryFn: () => request('/' + collection),
    select: DOC_COLLECTIONS.has(collection) ? undefined : (d) => toList(collection, d),
    ...options
  });
}

/* Several pages need a handful of collections at once. useQueries runs them in
   parallel under a single hook, so the number of collections a page asks for can
   vary without breaking the rules of hooks. */
export function useCollections(names, options = {}) {
  const env = useEnv();
  const results = useQueries({
    queries: names.map((n) => ({
      queryKey: collectionKey(env, n),
      queryFn: () => request('/' + n),
      select: DOC_COLLECTIONS.has(n) ? undefined : (d) => toList(n, d),
      ...options
    }))
  });
  const data = {};
  names.forEach((n, i) => { data[n] = results[i].data ?? (DOC_COLLECTIONS.has(n) ? {} : []); });
  return {
    data,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error || null,
    refetchAll: () => results.forEach((r) => r.refetch())
  };
}

function useInvalidate(collection) {
  const qc = useQueryClient();
  const env = useEnv();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: collectionKey(env, collection) }),
    [qc, env, collection]
  );
}

export function useCreate(collection) {
  const invalidate = useInvalidate(collection);
  return useMutation({
    mutationFn: (record) => request('/' + collection, { method: 'POST', body: record }),
    onSuccess: invalidate
  });
}

export function useUpdate(collection) {
  const invalidate = useInvalidate(collection);
  return useMutation({
    mutationFn: ({ id, ...patch }) =>
      request('/' + collection + '/' + encodeURIComponent(id), { method: 'PUT', body: patch }),
    onSuccess: invalidate
  });
}

export function useRemove(collection) {
  const invalidate = useInvalidate(collection);
  return useMutation({
    mutationFn: (id) => request('/' + collection + '/' + encodeURIComponent(id), { method: 'DELETE' }),
    onSuccess: invalidate
  });
}

/* Create-or-update in one call, for forms that handle both. */
export function useSave(collection) {
  const create = useCreate(collection);
  const update = useUpdate(collection);
  return {
    ...update,
    isPending: create.isPending || update.isPending,
    save: (record, { isNew } = {}) =>
      (isNew ? create : update).mutateAsync(isNew ? record : record)
  };
}

/* Client-recorded actions (exports, workflow steps) that have no record write
   of their own but still belong in the audit trail. */
export function useAuditAction() {
  const qc = useQueryClient();
  const env = useEnv();
  return useMutation({
    mutationFn: (entry) => request('/audit', { method: 'POST', body: entry }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionKey(env, 'audit') })
  });
}

/* Upload one file body and return its key. Bodies go straight to the server;
   the cached file records only ever hold metadata. */
export async function uploadFile({ name, mime, size, data }) {
  const id = 'FILE-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  await request('/files', { method: 'POST', body: { id, name, mime, size, data } });
  return id;
}

export async function downloadFile(key, fallbackName) {
  const res = await request('/files/' + encodeURIComponent(key) + '/download', { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName || 'document';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* Short-lived ticket that lets <img src> read a file body, which cannot carry
   an Authorization header. Refetched a little before it expires. */
export function useFileTicket() {
  const env = useEnv();
  const { data } = useQuery({
    queryKey: [env, 'file-ticket'],
    queryFn: () => request('/files/view-token'),
    staleTime: 8 * 60 * 1000,
    refetchInterval: 8 * 60 * 1000,
    retry: false
  });
  return useCallback(
    (key) => (key && data?.token
      ? `/api/files/${encodeURIComponent(key)}/view?t=${encodeURIComponent(data.token)}`
      : null),
    [data]
  );
}

export { getEnv };
