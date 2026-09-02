import { useMemo, useState } from 'react';
import { useCollection } from '../api/queries';
import { DataTable } from '../components/DataTable';
import { Button, Empty, Field, PageHeader, Select, Tag } from '../components/ui';
import { usePermissions } from '../lib/usePermissions';
import { downloadCsv, fmtDateTime } from '../lib/format';

export default function Audit() {
  const { can } = usePermissions();
  const { data: audit = [], isLoading } = useCollection('audit');
  const [action, setAction] = useState('');

  const actions = useMemo(
    () => [...new Set(audit.map((a) => a.action).filter(Boolean))].sort(),
    [audit]
  );

  const rows = useMemo(() => {
    const list = action ? audit.filter((a) => a.action === action) : audit;
    return [...list].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [audit, action]);

  const columns = useMemo(() => [
    { accessorKey: 'at', header: 'When', cell: (c) => <span className="tnum whitespace-nowrap">{fmtDateTime(c.getValue())}</span> },
    { accessorKey: 'user', header: 'User' },
    { accessorKey: 'role', header: 'Role' },
    { accessorKey: 'action', header: 'Action', cell: (c) => <Tag tone="blue">{c.getValue()}</Tag> },
    { accessorKey: 'entity', header: 'Entity' },
    { accessorKey: 'entityId', header: 'Record', cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span> },
    { accessorKey: 'details', header: 'Details' }
  ], []);

  return (
    <>
      <PageHeader title="Audit Trail" subtitle={`${audit.length} recorded events — written by the server, not the browser`}>
        {can('audit', 'export') && (
          <Button onClick={() => downloadCsv('audit.csv', rows, [
            { header: 'When', value: (a) => a.at }, { header: 'User', value: (a) => a.user },
            { header: 'Role', value: (a) => a.role }, { header: 'Action', value: (a) => a.action },
            { header: 'Entity', value: (a) => a.entity }, { header: 'Record', value: (a) => a.entityId },
            { header: 'Details', value: (a) => a.details }
          ])}>Export CSV</Button>
        )}
      </PageHeader>

      {isLoading ? <Empty>Loading…</Empty> : (
        <DataTable data={rows} columns={columns} pageSize={50} searchPlaceholder="Search the audit trail…"
          empty="No audit events." toolbar={
            <div className="w-40">
              <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
                <option value="">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
          } />
      )}
    </>
  );
}
