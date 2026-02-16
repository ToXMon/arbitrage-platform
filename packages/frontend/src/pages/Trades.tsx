/**
 * Trades page - Trade history and execution status
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../components/Card';
import { Table } from '../components/Table';

export function Trades() {
  const queryClient = useQueryClient();
  
  const { data: trades, isLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: async () => {
      const res = await fetch('/api/trades?limit=100');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      const res = await fetch(`/api/trades/${tradeId}/cancel`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });

  const statusColors: Record<string, string> = {
    pending: '#eab308',
    executing: '#3b82f6',
    confirmed: '#22c55e',
    failed: '#ef4444',
    reverted: '#ef4444',
  };

  if (isLoading) {
    return <div className="loading">Loading trades...</div>;
  }

  return (
    <div className="trades-page">
      <h2>Trade History</h2>
      
      <Card>
        <Table
          headers={['ID', 'Opportunity', 'Status', 'Profit', 'Gas Used', 'Time', 'Actions']}
          rows={(trades?.data || []).map((t: any) => [
            t.opportunityId?.slice(0, 8) || '-',
            t.opportunityId?.slice(0, 10) + '...' || '-',
            <span style={{ color: statusColors[t.status] }}>{t.status}</span>,
            t.profit ? `${t.profit} wei` : '-',
            t.gasUsed ? `${t.gasUsed}` : '-',
            new Date(t.timestamp).toLocaleString(),
            t.status === 'pending' ? (
              <button onClick={() => cancelMutation.mutate(t.opportunityId)}>
                Cancel
              </button>
            ) : null,
          ])}
        />
        {(!trades?.data || trades.data.length === 0) && (
          <div className="empty-state">No trades found</div>
        )}
      </Card>
    </div>
  );
}
