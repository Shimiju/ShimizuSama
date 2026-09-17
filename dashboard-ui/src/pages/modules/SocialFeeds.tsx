import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Plus, Trash2, MonitorPlay } from 'lucide-react';

interface SocialFeed {
  id: string;
  platform: string;
  handle: string;
  channelId: string;
  message: string;
  createdAt: string;
}

export default function SocialFeeds() {
  const { guildId, data }: any = useOutletContext();
  const [feeds, setFeeds] = useState<SocialFeed[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newHandle, setNewHandle] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newMessage, setNewMessage] = useState('Hey @everyone, {creator} just uploaded a new video!\n{link}');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const fetchFeeds = async () => {
    try {
      const res = await axios.get(`/api/guilds/${guildId}/social-feeds`, { withCredentials: true });
      setFeeds(res.data);
    } catch (err) {
      console.error('Failed to fetch feeds', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeds();
  }, [guildId]);

  const handleAddFeed = async () => {
    if (!newHandle || !newChannelId) {
      setError('Please provide a YouTube Channel ID and select a Discord channel.');
      return;
    }

    setIsAdding(true);
    setError('');

    try {
      await axios.post(`/api/guilds/${guildId}/social-feeds`, {
        platform: 'YOUTUBE',
        handle: newHandle,
        channelId: newChannelId,
        message: newMessage,
      }, { withCredentials: true });
      
      setNewHandle('');
      setNewChannelId('');
      setNewMessage('Hey @everyone, {creator} just uploaded a new video!\n{link}');
      await fetchFeeds();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add feed');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteFeed = async (feedId: string) => {
    try {
      await axios.delete(`/api/guilds/${guildId}/social-feeds/${feedId}`, { withCredentials: true });
      setFeeds(feeds.filter(f => f.id !== feedId));
    } catch (err) {
      console.error('Failed to delete feed', err);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '10px' }}>Social Feeds</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>
        Automatically announce new YouTube videos to your server.
      </p>

      {/* Add New Feed */}
      <div className="glass-panel" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MonitorPlay color="#FF0000" /> Add YouTube Feed
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div className="form-group">
            <label className="form-label">YouTube Channel ID</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. UCX6OQ3DkcsbYNE6H8uQQuVA"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Must be the exact Channel ID (24 characters, starts with UC).
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Discord Channel</label>
            <select 
              className="form-control"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
            >
              <option value="">Select a channel...</option>
              {data?.channels?.filter((c: any) => c.type === 0).map((c: any) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label className="form-label">Custom Ping Message</label>
          <textarea 
            className="form-control" 
            style={{ height: '80px', resize: 'vertical' }}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            Available placeholders: {'{creator}'}, {'{title}'}, {'{link}'}
          </span>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '15px', fontWeight: 500 }}>{error}</div>}

        <button 
          className="btn btn-primary" 
          onClick={handleAddFeed}
          disabled={isAdding}
        >
          <Plus size={18} /> {isAdding ? 'Adding...' : 'Add Feed'}
        </button>
      </div>

      {/* Active Feeds List */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>Active Feeds</h2>
      
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading feeds...</div>
      ) : feeds.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <MonitorPlay size={48} style={{ opacity: 0.3, marginBottom: '15px' }} />
          <h3>No feeds configured.</h3>
          <p>Add a YouTube channel above to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {feeds.map((feed) => {
            const discordChannel = data?.channels?.find((c: any) => c.id === feed.channelId);
            
            return (
              <div key={feed.id} className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ background: 'rgba(255,0,0,0.1)', padding: '12px', borderRadius: '50%' }}>
                    <MonitorPlay color="#FF0000" size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{feed.handle}</h3>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      Posting in <strong style={{ color: '#fff' }}>#{discordChannel?.name || 'unknown-channel'}</strong>
                    </p>
                  </div>
                </div>
                
                <button 
                  className="btn btn-secondary" 
                  style={{ color: 'var(--danger)', borderColor: 'rgba(255, 92, 92, 0.2)' }}
                  onClick={() => handleDeleteFeed(feed.id)}
                >
                  <Trash2 size={18} /> Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
