import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';


interface AuditLog {
  id: string;
  guildId: string;
  type: string;
  action: string;
  targetId: string | null;
  moderatorId: string | null;
  details: any;
  createdAt: string;
}

const AuditLogs: React.FC = () => {
  const { guildId } = useOutletContext<any>();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const url = new URL(`/api/guilds/${guildId}/audit-logs`, window.location.origin);
      if (filterType) url.searchParams.append('type', filterType);
      url.searchParams.append('page', page.toString());

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [guildId, filterType, page]);

  const getLogIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('deleted')) return '🗑️';
    if (act.includes('banned')) return '🔨';
    if (act.includes('kicked')) return '👢';
    if (act.includes('muted') || act.includes('timeout')) return '🔇';
    if (act.includes('warned')) return '⚠️';
    if (act.includes('joined')) return '👋';
    if (act.includes('left')) return '🚪';
    return '📝';
  };

  return (
    <div style={{ color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>Web Archives</h1>
          <p style={{ color: '#a9b1d6' }}>Browse and search the permanent audit log archive.</p>
        </div>
        <div>
          <select 
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            style={{
              padding: '10px 15px',
              borderRadius: '8px',
              backgroundColor: '#1a1b26',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              outline: 'none'
            }}
          >
            <option value="">All Logs</option>
            <option value="moderationLogs">Moderation Actions</option>
            <option value="messageLogs">Message Logs</option>
            <option value="memberLogs">Member Joins/Leaves</option>
            <option value="serverLogs">Server Settings</option>
          </select>
        </div>
      </div>

      <div style={{
        backgroundColor: '#24283b',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.05)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a9b1d6' }}>Loading logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a9b1d6' }}>
            No logs found in the archive.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'left', fontSize: '0.9rem', color: '#a9b1d6' }}>
                <th style={{ padding: '15px 20px' }}>Action</th>
                <th style={{ padding: '15px 20px' }}>Target ID</th>
                <th style={{ padding: '15px 20px' }}>Moderator ID</th>
                <th style={{ padding: '15px 20px' }}>Details</th>
                <th style={{ padding: '15px 20px', textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '15px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{getLogIcon(log.action)}</span>
                      <strong style={{ color: '#7aa2f7' }}>{log.action}</strong>
                    </div>
                  </td>
                  <td style={{ padding: '15px 20px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {log.targetId || '-'}
                  </td>
                  <td style={{ padding: '15px 20px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {log.moderatorId || '-'}
                  </td>
                  <td style={{ padding: '15px 20px', fontSize: '0.9rem', color: '#a9b1d6' }}>
                    {log.details?.fields?.map((f: any) => (
                      <div key={f.name}>
                        <strong>{f.name}:</strong> {f.value.length > 50 ? f.value.substring(0, 50) + '...' : f.value}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: '15px 20px', textAlign: 'right', fontSize: '0.85rem', color: '#565f89' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '8px 16px', borderRadius: '6px', backgroundColor: page === 1 ? '#16161e' : '#7aa2f7',
              color: '#fff', border: 'none', cursor: page === 1 ? 'not-allowed' : 'pointer'
            }}
          >
            Previous
          </button>
          <span style={{ padding: '8px 16px', color: '#a9b1d6' }}>Page {page} of {totalPages}</span>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '8px 16px', borderRadius: '6px', backgroundColor: page === totalPages ? '#16161e' : '#7aa2f7',
              color: '#fff', border: 'none', cursor: page === totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
