import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock, MessageSquare, AlertCircle } from 'lucide-react';

interface TicketMessage {
  authorId: string;
  username: string;
  avatar: string;
  content: string;
  timestamp: string;
}

interface TicketData {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  claimerId: string | null;
  status: string;
  transcript: TicketMessage[] | null;
  createdAt: string;
  closedAt: string;
}

export default function TicketViewer() {
  const { guildId, ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`/api/guilds/${guildId}/tickets/${ticketId}`, {
          withCredentials: true,
        });
        setTicket(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch transcript');
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [guildId, ticketId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#fff' }}>
        <p>Loading transcript...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px', color: '#ff5c5c' }}>
        <AlertCircle size={48} style={{ marginBottom: '20px' }} />
        <h2>{error || 'Ticket not found'}</h2>
        <button onClick={() => navigate(`/dashboard/${guildId}/tickets`)} className="btn btn-secondary" style={{ marginTop: '20px' }}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button 
            onClick={() => navigate(`/dashboard/${guildId}/tickets`)}
            className="btn btn-secondary"
            style={{ padding: '8px', borderRadius: '50%' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={20} /> Ticket Transcript
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              ID: {ticket.id}
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Clock size={14} /> Closed: {new Date(ticket.closedAt).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Created by:</span> <span style={{ color: '#fff' }}>{ticket.creatorId}</span>
          </div>
          {ticket.claimerId && (
            <div style={{ fontSize: '0.9rem', marginTop: '2px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Claimed by:</span> <span style={{ color: '#57F287' }}>{ticket.claimerId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Viewer */}
      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {!ticket.transcript || ticket.transcript.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
            <MessageSquare size={48} style={{ opacity: 0.5, marginBottom: '20px' }} />
            <h3>No messages were recorded for this ticket.</h3>
          </div>
        ) : (
          ticket.transcript.map((msg, idx) => {
            const isStaff = msg.authorId === ticket.claimerId;
            return (
              <div key={idx} style={{ display: 'flex', gap: '15px' }}>
                <img 
                  src={msg.avatar} 
                  alt={msg.username} 
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: isStaff ? '2px solid #57F287' : 'none' }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <span style={{ fontWeight: 600, color: isStaff ? '#57F287' : '#fff' }}>
                      {msg.username}
                      {isStaff && <span style={{ fontSize: '0.7rem', background: '#57F287', color: '#000', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>STAFF</span>}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ 
                    marginTop: '5px', 
                    color: '#dcddde', 
                    background: 'rgba(255,255,255,0.03)', 
                    padding: '12px 15px', 
                    borderRadius: '8px',
                    borderTopLeftRadius: 0,
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
