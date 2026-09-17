import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { ShoppingBag, Plus, Trash2, Tag } from 'lucide-react';

export default function Shop() {
  const { data, guildId }: any = useOutletContext();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newItem, setNewItem] = useState({ name: '', description: '', price: '', roleId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [guildId]);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`/api/guilds/${guildId}/shop`, { withCredentials: true });
      setItems(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    
    setSaving(true);
    try {
      const res = await axios.post(`/api/guilds/${guildId}/shop`, newItem, { withCredentials: true });
      setItems([...items, res.data]);
      setNewItem({ name: '', description: '', price: '', roleId: '' });
    } catch (err) {
      alert('Failed to add item');
    }
    setSaving(false);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this shop item?')) return;
    try {
      await axios.delete(`/api/guilds/${guildId}/shop/${itemId}`, { withCredentials: true });
      setItems(items.filter(i => i.id !== itemId));
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ShoppingBag size={32} color="var(--primary)" /> The Grand Bazaar
      </h1>
      
      <p style={{ color: 'var(--text-muted)', marginBottom: '30px', maxWidth: '800px', lineHeight: '1.6' }}>
        Welcome to the Grand Bazaar! Here you can create and manage items that users can buy with their Manor Gold using the `/shop` and `/buy` commands. You can optionally link a Discord Role to an item, and the bot will automatically grant the role to the user upon purchase!
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
        
        {/* Create Item Panel */}
        <div className="glass-panel" style={{ height: 'fit-content' }}>
          <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={20} /> Add New Item
          </h2>
          
          <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label className="form-label">Item Name *</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. VIP Pass"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Price (Manor Gold) *</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 500"
                min="0"
                value={newItem.price}
                onChange={e => setNewItem({...newItem, price: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea 
                className="form-control" 
                placeholder="Gain access to the exclusive VIP lounge!"
                value={newItem.description}
                onChange={e => setNewItem({...newItem, description: e.target.value})}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Assign Role on Purchase</label>
              <select 
                className="form-control" 
                value={newItem.roleId}
                onChange={e => setNewItem({...newItem, roleId: e.target.value})}
              >
                <option value="">None (Purely Cosmetic)</option>
                {data.roles.map((r: any) => (
                  <option key={r.id} value={r.id}>@{r.name}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '10px' }}>
              {saving ? 'Adding...' : 'Add Item to Shop'}
            </button>
          </form>
        </div>

        {/* Existing Items Panel */}
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={20} /> Current Stock ({items.length})
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading items...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <ShoppingBag size={48} style={{ opacity: 0.3, marginBottom: '15px' }} />
              <p>The vault is empty. Add your first item!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', padding: '20px' }}>
              {items.map(item => (
                <div key={item.id} style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '15px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: 0.7 }}
                    title="Delete Item"
                  >
                    <Trash2 size={16} />
                  </button>
                  
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', color: '#fff', paddingRight: '20px' }}>{item.name}</h3>
                  <div style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    🪙 {item.price.toLocaleString()} Gold
                  </div>
                  
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 15px 0', flex: 1 }}>
                    {item.description || <i>No description</i>}
                  </p>
                  
                  {item.roleId && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', color: '#aaa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5865F2' }}></div>
                      Grants Role: @{data.roles.find((r:any) => r.id === item.roleId)?.name || 'Unknown Role'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
