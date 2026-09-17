import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Save, ExternalLink, Ticket, Search, Trash2 } from 'lucide-react';

export default function Tickets() {
  const { data, setData, guildId }: any = useOutletContext();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await axios.get(`/api/guilds/${guildId}/tickets`, { withCredentials: true });
        setTickets(res.data);
      } catch (err) {
        console.error('Failed to fetch tickets', err);
      } finally {
        setLoadingTickets(false);
      }
    };
    fetchTickets();
  }, [guildId]);

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to permanently delete this ticket log?')) return;
    try {
      await axios.delete(`/api/guilds/${guildId}/tickets/${ticketId}`, { withCredentials: true });
      setTickets(tickets.filter(t => t.id !== ticketId));
    } catch (err) {
      console.error('Failed to delete ticket', err);
      alert('Failed to delete ticket.');
    }
  };

  const handleChange = (field: string, value: any) => {
    setData((prev: any) => ({
      ...prev,
      ticketSettings: { ...prev.ticketSettings, [field]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await axios.post(`/api/guilds/${guildId}/settings`, {
        ...data.settings,
        ...data.ticketSettings
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <div>
      <h1 style={{ marginBottom: '30px' }}>Tickets Config</h1>

      <div className="glass-panel" style={{ maxWidth: '600px' }}>
        <div className="form-group">
          <label className="form-label">Support Role</label>
          <select 
            value={data.ticketSettings.supportRoleId || ''} 
            onChange={(e) => handleChange('supportRoleId', e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', fontFamily: 'inherit' }}
          >
            <option value="">None</option>
            {data.roles.map((r: any) => (
              <option key={r.id} value={r.id}>@{r.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>This role can view and manage tickets.</span>
        </div>

        <div className="form-group" style={{ marginTop: '20px' }}>
          <label className="form-label">Ticket Category</label>
          <select 
            value={data.ticketSettings.categoryId || ''} 
            onChange={(e) => handleChange('categoryId', e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', fontFamily: 'inherit' }}
          >
            <option value="">No Category</option>
            {data.channels.filter((c: any) => c.type === 4).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginTop: '20px' }}>
          <label className="form-label">Transcript Channel</label>
          <select 
            value={data.ticketSettings.transcriptChannelId || ''} 
            onChange={(e) => handleChange('transcriptChannelId', e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', fontFamily: 'inherit' }}
          >
            <option value="">No Transcripts</option>
            {data.channels.filter((c: any) => c.type === 0).map((c: any) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: '30px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          {success && <span style={{ color: 'var(--success)', fontWeight: 500 }}>Saved successfully!</span>}
          {error && <span style={{ color: 'var(--danger)', fontWeight: 500 }}>{error}</span>}
        </div>
      </div>

      {/* Ticket History Section */}
      <h2 style={{ marginTop: '50px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Ticket size={24} /> Ticket History
      </h2>
      
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loadingTickets ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Search size={40} style={{ opacity: 0.5, marginBottom: '15px' }} />
            <p>No closed tickets found for this server.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Ticket ID</th>
                <th style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Creator</th>
                <th style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Claimed By</th>
                <th style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Closed At</th>
                <th style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '15px 20px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.id.split('-')[0]}...</td>
                  <td style={{ padding: '15px 20px' }}>{t.creatorName || t.creatorId}</td>
                  <td style={{ padding: '15px 20px', color: t.claimerId ? '#57F287' : 'var(--text-muted)' }}>
                    {t.claimerName || t.claimerId || 'Unclaimed'}
                  </td>
                  <td style={{ padding: '15px 20px' }}>{new Date(t.closedAt).toLocaleDateString()}</td>
                  <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => navigate(`/dashboard/${guildId}/tickets/${t.id}`)}
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      >
                        <ExternalLink size={14} style={{ marginRight: '6px' }} /> View
                      </button>
                      <button 
                        onClick={() => handleDeleteTicket(t.id)}
                        className="btn" 
                        style={{ padding: '6px 12px', fontSize: '0.85rem', background: 'rgba(247, 118, 142, 0.2)', color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} style={{ marginRight: '6px' }} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
