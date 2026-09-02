import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { request } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, Input, PageHeader, Tag, useConfirm, useToast } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';

const ENDPOINTS = [
  ['GET', '/api/students', 'List students — any field works as a query filter'],
  ['GET', '/api/students/{id}', 'One student record'],
  ['POST', '/api/students', 'Create (an Admissions push)'],
  ['PUT', '/api/students/{id}', 'Update — merges into the existing record'],
  ['DELETE', '/api/students/{id}', 'Delete'],
  ['POST', '/api/movements', 'Push a gate / card-access event'],
  ['GET', '/api/files/{key}/download', 'Stored file body (agreements, evidence, photos)'],
  ['GET', '/api/bootstrap', 'Everything a client needs in one call (metadata only for files)'],
  ['GET', '/api/admin/backup', 'Full JSON dump of the current environment'],
  ['GET', '/api/health', 'Liveness — reports the database and auth mode']
];

export default function Integration() {
  const toast = useToast();
  const qc = useQueryClient();
  const { env } = useAuth();
  const { isAdmin } = usePermissions();
  const [busy, setBusy] = useState(null);
  const [confirm, confirmNode] = useConfirm();

  async function clone() {
    if (!(await confirm(
      'Copy every production record into Non-Production? Everything currently in Non-Production is replaced.',
      { title: 'Clone Production → Non-Production', confirmLabel: 'Clone' }))) return;
    setBusy('clone');
    try {
      await request('/admin/clone-prod-to-test', { method: 'POST' });
      qc.clear();
      toast('Production cloned into Non-Production');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  }

  async function backup() {
    setBusy('backup');
    try {
      const dump = await request('/admin/backup');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sma-housing-backup-${env}-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Backup downloaded');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  }

  async function reset() {
    if (!(await confirm(
      `Wipe the ${env === 'prod' ? 'Production' : 'Non-Production'} environment and reseed demo data? This cannot be undone.`,
      { title: 'Reset demo data', confirmLabel: 'Wipe and reseed' }))) return;
    setBusy('reset');
    try {
      await request('/admin/reset-demo', { method: 'POST' });
      qc.clear();
      toast('Environment reset and reseeded');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  }

  return (
    <>
      {confirmNode}
      <PageHeader title="Integration & API"
        subtitle="REST endpoints for other systems, plus environment tools" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Environment tools">
          {isAdmin ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={clone} disabled={busy === 'clone'}>
                  {busy === 'clone' ? 'Cloning…' : 'Clone Production → Non-Prod'}
                </Button>
                <Button onClick={backup} disabled={busy === 'backup'}>
                  {busy === 'backup' ? 'Preparing…' : 'Download JSON backup'}
                </Button>
                <Button variant="danger" onClick={reset} disabled={busy === 'reset'}>
                  {busy === 'reset' ? 'Resetting…' : 'Reset demo data'}
                </Button>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                You are working in <strong>{env === 'prod' ? 'Production' : 'Non-Production'}</strong>.
                Backup and reset act on this environment; clone always copies Production into Non-Production.
              </p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              These tools are restricted to Administrators.
            </p>
          )}
        </Card>

        <Card title="Authentication">
          <div className="grid gap-2 text-sm">
            <p style={{ color: 'var(--ink-soft)' }}>
              Every request carries a bearer token and an <code className="font-mono text-xs">X-Env</code> header
              naming the environment (<code className="font-mono text-xs">prod</code> or
              {' '}<code className="font-mono text-xs">test</code>). Omit it and the API answers for Production.
            </p>
            <pre className="overflow-x-auto rounded-md p-3 font-mono text-xs"
              style={{ background: 'var(--leaf-soft)', color: 'var(--ink)' }}>
{`curl -X POST /api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"amal","password":"admin123"}'

curl /api/students \\
  -H 'Authorization: Bearer <token>' \\
  -H 'X-Env: test'`}
            </pre>
          </div>
        </Card>

        <Card title="Endpoints" className="lg:col-span-2" bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>Method</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>Path</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map(([method, path, purpose]) => (
                  <tr key={method + path} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-4 py-2"><Tag tone={method === 'DELETE' ? 'brick' : method === 'GET' ? 'blue' : 'green'}>{method}</Tag></td>
                    <td className="px-4 py-2 font-mono text-xs">{path}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--ink-soft)' }}>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            The same verbs work for <code className="font-mono">attendance</code>, <code className="font-mono">violations</code>,
            {' '}<code className="font-mono">complaints</code>, <code className="font-mono">requests</code>,
            {' '}<code className="font-mono">documents</code>, <code className="font-mono">calendar</code> and
            {' '}<code className="font-mono">master</code>. Every write is checked against the caller's role and recorded
            in the audit trail.
          </p>
        </Card>
      </div>
    </>
  );
}
