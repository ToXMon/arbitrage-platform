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

  const opportunityList = Array.isArray(opportunities?.data) ? opportunities.data : [];

  if (isLoading) {
    return <div className="loading">Loading opportunities...</div>;
  }

  return (
    <div className="opportunities-page">
      <h2>Arbitrage Opportunities</h2>
      
      <Card>
        <Table
          headers={['ID', 'Chain', 'Token In', 'Token Out', 'Profit USD', 'Status', 'Time']}
          rows={opportunityList.map((o: any) => [
            o.id?.slice(0, 8) || '-',
            o.chain || o.route?.chainId || '-',
            o.tokenIn ? `${o.tokenIn.slice(0, 10)}...` : '-',
            o.tokenOut ? `${o.tokenOut.slice(0, 10)}...` : '-',
            `$${Number(o.profitUSD ?? o.expectedProfit ?? 0).toFixed(2)}`,
            o.executed ? 'Executed' : 'Available',
            new Date(o.timestamp || Date.now()).toLocaleTimeString(),
          ])}
        />
        {opportunityList.length === 0 && (
          <div className="empty-state">No opportunities found</div>
        )}
      </Card>
    </div>
  );
}

export default Opportunities;
