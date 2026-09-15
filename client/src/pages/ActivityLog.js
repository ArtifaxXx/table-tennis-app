import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const PAGE_SIZE = 200;

const EVENT_BADGES = {
  visit: 'bg-blue-100 text-blue-800 border-blue-200',
  edit: 'bg-green-100 text-green-800 border-green-200',
  auth: 'bg-amber-100 text-amber-800 border-amber-200',
};

const formatDateTime = (value) => {
  if (!value) return '';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const describeRow = (row) => {
  const parts = [];
  if (row.action) parts.push(row.action);
  if (row.entity && row.entity !== 'site' && row.entity !== 'auth') {
    parts.push(`${row.entity}${row.entity_id ? ` #${row.entity_id}` : ''}`);
  }
  return parts.join(' ') || row.event_type;
};

const ActivityLog = () => {
  const { isSystemAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(
    async (offset = 0, append = false) => {
      try {
        const params = { limit: PAGE_SIZE, offset };
        if (eventType) params.eventType = eventType;
        if (actorFilter.trim()) params.actor = actorFilter.trim();
        const res = await axios.get('/api/admin/activity-logs', { params });
        const nextRows = res.data || [];
        setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
        setHasMore(nextRows.length === PAGE_SIZE);
      } catch (error) {
        console.error('Error fetching activity logs:', error);
      } finally {
        setLoading(false);
      }
    },
    [eventType, actorFilter]
  );

  useEffect(() => {
    if (!isSystemAdmin) return;
    setLoading(true);
    fetchLogs(0, false);
  }, [isSystemAdmin, fetchLogs]);

  if (!isSystemAdmin) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-600">Admin access required to view the activity log.</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        subtitle="Who did what on the site"
        right={
          <button
            type="button"
            onClick={() => fetchLogs(0, false)}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <RefreshCw size={18} />
            <span>Refresh</span>
          </button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event type</label>
            <select
              className="input"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              <option value="">All</option>
              <option value="visit">Visits</option>
              <option value="edit">Edits</option>
              <option value="auth">Auth</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actor</label>
            <input
              type="text"
              className="input"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="Filter by name"
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading activity...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No activity logged yet.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Device</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-800">
                    {row.actor || '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        EVENT_BADGES[row.event_type] || 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      {row.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{describeRow(row)}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-[240px] truncate" title={row.details?.path || ''}>
                    {row.details?.path || ''}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{row.ip_address || '—'}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-[220px] truncate" title={row.user_agent || ''}>
                    {row.user_agent || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchLogs(rows.length, true)}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
