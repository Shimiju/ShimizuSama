import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

interface HighRoller {
  userId: string;
  user: {
    username?: string;
  };
  profit: number;
  wins: number;
  losses: number;
}

const Casino: React.FC = () => {
  const { guildId } = useOutletContext<any>();
  const [leaderboard, setLeaderboard] = useState<HighRoller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/casino/leaderboard`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
      setLeaderboard(data);
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [guildId]);

  return (
    <div style={{ color: '#fff' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>🎲 The Grand Casino Resort</h1>
        <p style={{ color: '#a9b1d6' }}>See who the biggest high-rollers and most unlucky gamblers are in your server.</p>
      </div>

      <div style={{
        backgroundColor: '#24283b',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.05)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a9b1d6' }}>Loading High Rollers...</div>
        ) : leaderboard.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a9b1d6' }}>
            The casino floor is empty. No one has gambled yet!
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'left', fontSize: '0.9rem', color: '#a9b1d6' }}>
                <th style={{ padding: '15px 20px' }}>Rank</th>
                <th style={{ padding: '15px 20px' }}>Player</th>
                <th style={{ padding: '15px 20px' }}>Total Profit</th>
                <th style={{ padding: '15px 20px' }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((player, index) => {
                const totalGames = player.wins + player.losses;
                const winRate = totalGames > 0 ? Math.round((player.wins / totalGames) * 100) : 0;
                
                return (
                  <tr key={player.userId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <strong style={{ color: '#7aa2f7' }}>{player.user.username || 'Unknown User'}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#565f89', marginTop: '4px' }}>{player.userId}</div>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>🪙</span>
                        <strong style={{ color: player.profit > 0 ? '#9ece6a' : player.profit < 0 ? '#f7768e' : '#a9b1d6' }}>
                          {player.profit > 0 ? '+' : ''}{player.profit.toLocaleString()}
                        </strong>
                      </div>
                    </td>
                    <td style={{ padding: '15px 20px', color: '#a9b1d6' }}>
                      <div style={{ fontWeight: 'bold', color: winRate >= 50 ? '#9ece6a' : '#f7768e' }}>
                        {winRate}%
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#565f89' }}>
                        {player.wins}W / {player.losses}L
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Casino;
