/**
 * Dashboard page - Overview of platform status
 */

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Card } from '../components/Card';
import { StatCard } from '../components/StatCard';

const mockProfitData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  profit: Math.random() * 100 + 50,
  trades: Math.floor(Math.random() * 20) + 5,
}));

export function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const [trades, opportunities] = await Promise.all([
        fetch('/api/trades/stats').then((r) => r.json()),
        fetch('/api/opportunities/stats').then((r) => r.json()),
      ]);
      return { trades, opportunities };
    },
    refetchInterval: 10000,
  });

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      
      <div className="stats-grid">
        <StatCard
          title="Total Profit"
          value={`$${(stats?.trades?.totalProfit || 0).toString()}`}
          trend="+12.5%"
          trendUp={true}
        />
        <StatCard
          title="Total Trades"
          value={stats?.trades?.total?.toString() || '0'}
          subtitle={`${stats?.trades?.successful || 0} successful`}
        />
        <StatCard
          title="Active Bots"
          value="3"
          subtitle="2 running, 1 stopped"
        />
        <StatCard
          title="Opportunities"
          value={stats?.opportunities?.total?.toString() || '0'}
          subtitle={`Avg: $${(stats?.opportunities?.avgProfitUSD || 0).toFixed(2)}`}
        />
      </div>

      <div className="charts-grid">
        <Card title="Profit Over Time" className="chart-card">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={mockProfitData}>
              <XAxis dataKey="time" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #27272a' }}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#3b82f6"
                fill="#3b82f620"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Trades Per Hour" className="chart-card">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={mockProfitData}>
              <XAxis dataKey="time" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a25', border: '1px solid #27272a' }}
              />
              <Line
                type="monotone"
                dataKey="trades"
                stroke="#22c55e"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
