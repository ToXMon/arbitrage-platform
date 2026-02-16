/**
 * Bots page - Bot management and status
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../components/Card';

export function Bots() {
  const queryClient = useQueryClient();
  
  const { data: bots, isLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: async () => {
      const res = await fetch('/api/bots');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const startMutation = useMutation({
    mutationFn: async (botId: string) => {
      const res = await fetch(`/api/bots/${botId}/start`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (botId: string) => {
      const res = await fetch(`/api/bots/${botId}/stop`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  if (isLoading) {
    return <div className="loading">Loading bots...</div>;
  }

  return (
    <div className="bots-page">
      <h2>Bot Management</h2>
      
      <div className="bots-grid">
        {(bots || []).map((bot: any) => (
          <Card key={bot.id} className="bot-card">
            <div className="bot-header">
              <h3>{bot.botId?.slice(0, 12)}...</h3>
              <span className={`status-badge ${bot.status}`}>
                {bot.status}
              </span>
            </div>
            
            <div className="bot-info">
              <div className="info-row">
                <span>Chain ID:</span>
                <span>{bot.chainId}</span>
              </div>
              <div className="info-row">
                <span>Enabled:</span>
                <span>{bot.enabled ? 'Yes' : 'No'}</span>
              </div>
              <div className="info-row">
                <span>Strategies:</span>
                <span>{bot.strategies?.length || 0}</span>
              </div>
            </div>
            
            <div className="bot-actions">
              {bot.status === 'running' ? (
                <button 
                  className="btn-danger"
                  onClick={() => stopMutation.mutate(bot.id)}
                >
                  Stop
                </button>
              ) : (
                <button 
                  className="btn-success"
                  onClick={() => startMutation.mutate(bot.id)}
                >
                  Start
                </button>
              )}
            </div>
          </Card>
        ))}
        
        {(!bots || bots.length === 0) && (
          <Card className="empty-card">
            <div className="empty-state">No bots configured</div>
          </Card>
        )}
      </div>
    </div>
  );
}
