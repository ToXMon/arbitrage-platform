/**
 * Opportunities page - List of detected arbitrage opportunities
 */

import { useQuery } from '@tanstack/react-query';
import { Card } from '../components/Card';
import { Table } from '../components/Table';

export function Opportunities() {
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const res = await fetch('/api/opportunities?limit=100');
      return res.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="loading">Loading opportunities...</div>;
  }

  return (
    <div className="opportunities-page">
      <h2>Arbitrage Opportunities</h2>
      
      <Card>
        <Table
          headers={['ID', 'Chain', 'Token In', 'Token Out', 'Profit USD', 'Status', 'Time']}
          rows={(opportunities?.data || []).map((o: any) => [
            o.id.slice(0, 8),
            o.route.chainId,
            o.tokenIn.slice(0, 10) + '...',
            o.tokenOut.slice(0, 10) + '...',
            `$${o.profitUSD.toFixed(2)}`,
            'Available',
            new Date(o.timestamp).toLocaleTimeString(),
          ])}
        />
        {(!opportunities?.data || opportunities.data.length === 0) && (
          <div className="empty-state">No opportunities found</div>
        )}
      </Card>
    </div>
  );
}
