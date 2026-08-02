import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

// Mini Sparkline Chart for Stat Cards (Fitshop style)
export function MiniSparklineChart({ data, type = 'line', color = '#3B82F6' }: { data: number[]; type?: 'line' | 'bar'; color?: string }) {
  const chartData = data.map((val, idx) => ({ id: idx, value: val }));
  const { theme } = useTheme();
  
  if (type === 'bar') {
    return (
      <div className="h-8 w-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <Bar 
              dataKey="value" 
              fill={color} 
              radius={[1, 1, 0, 0]} 
              filter={theme === 'dark' ? `drop-shadow(0 0 3px ${color}88)` : undefined}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={1.5} 
            dot={false} 
            filter={theme === 'dark' ? `drop-shadow(0 0 3px ${color}88)` : undefined}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Grouped Bar Chart: Coupon Allocation vs Redemption Activity (Manager Dashboard)
export function CouponActivityChart({ period = 'week', data: externalData }: { period: string; data?: { name: string; Allocated: number; Redeemed: number }[] }) {
  const { theme } = useTheme();

  // Theme-aware variables
  const gridColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const tooltipBg = theme === 'dark' ? '#0D1B2E' : '#1E293B';
  const tooltipText = theme === 'dark' ? '#F0F6FF' : '#F8FAFC';

  const fallbackData = [
    { name: 'Mon', Allocated: 12000, Redeemed: 8500 },
    { name: 'Tue', Allocated: 15000, Redeemed: 11200 },
    { name: 'Wed', Allocated: 14500, Redeemed: 12100 },
    { name: 'Thu', Allocated: 18000, Redeemed: 14500 },
    { name: 'Fri', Allocated: 20000, Redeemed: 16800 },
    { name: 'Sat', Allocated: 8000, Redeemed: 5200 },
    { name: 'Sun', Allocated: 5000, Redeemed: 3100 },
  ];
  const data = externalData && externalData.length > 0 ? externalData : fallbackData;

  return (
    <div className="h-48 md:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
          <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `ETB ${v.toLocaleString()}`} />
          <Tooltip 
            contentStyle={{ backgroundColor: tooltipBg, borderRadius: '8px', border: 'none', color: tooltipText }}
            itemStyle={{ color: tooltipText }}
            formatter={(value) => [`ETB ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          <Bar 
            dataKey="Allocated" 
            fill="#3B82F6" 
            radius={[4, 4, 0, 0]} 
            name="Allocated (ETB)" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.45))' : undefined}
          />
          <Bar 
            dataKey="Redeemed" 
            fill="#8B5CF6" 
            radius={[4, 4, 0, 0]} 
            name="Redeemed (ETB)" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.45))' : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Balance Status Allocation Donut Chart (Manager Dashboard)
export function BalanceStatusDonut({ activeCount = 31, expiredCount = 9 }: { activeCount?: number; expiredCount?: number }) {
  const { theme } = useTheme();
  
  const data = [
    { name: 'Active Employees', value: activeCount, color: '#3B82F6' },
    { name: 'Expired / Other', value: expiredCount, color: '#F59E0B' },
  ];
  const total = activeCount + expiredCount;
  const activePercent = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  
  const labelColorClass = theme === 'dark' ? 'text-brand-secondary' : 'text-brand-primary';

  return (
    <div className="relative flex flex-col items-center justify-center h-48 md:h-64 w-full">
      <div className="relative w-full h-36 md:h-48" style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color} 
                  filter={theme === 'dark' ? `drop-shadow(0 0 4px ${entry.color}66)` : undefined}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        {/* Perfectly centered label — absolutely positioned */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            lineHeight: 1.2,
          }}
        >
          <div
            className={labelColorClass}
            style={{
              fontSize: '28px',
              fontWeight: '800',
              letterSpacing: '-1px',
            }}
          >
            {activePercent}%
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: '700',
              color: 'var(--text-subtle)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginTop: '2px',
            }}
          >
            ACTIVE
          </div>
        </div>
      </div>

      {/* Custom Legend */}
      <div className="flex gap-4 justify-center mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-secondary"></div>
          <span className="text-text-primary font-medium">{activeCount} Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-warning"></div>
          <span className="text-text-primary font-medium">{expiredCount} Expired</span>
        </div>
      </div>
    </div>
  );
}

// Daily Order Volume (Cafe Dashboard)
export function DailyOrderVolumeChart() {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const tooltipBg = theme === 'dark' ? '#0D1B2E' : '#1E293B';
  const tooltipText = theme === 'dark' ? '#F0F6FF' : '#F8FAFC';

  const data = [
    { day: 'Mon', orders: 120 },
    { day: 'Tue', orders: 145 },
    { day: 'Wed', orders: 132 },
    { day: 'Thu', orders: 185 },
    { day: 'Fri', orders: 210 },
    { day: 'Sat', orders: 75 },
    { day: 'Sun', orders: 40 },
  ];

  return (
    <div className="h-48 md:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis dataKey="day" stroke="#64748B" fontSize={12} tickLine={false} />
          <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderRadius: '8px', border: 'none', color: tooltipText }} />
          <Bar 
            dataKey="orders" 
            fill="#3B82F6" 
            radius={[4, 4, 0, 0]} 
            name="Orders Filled" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.45))' : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Most Frequent Employee Visitors (Horizontal Bar, Cafe Analytics)
export function FrequentVisitorsChart({ data = [] }: { data?: any[] }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const tooltipBg = theme === 'dark' ? '#0D1B2E' : '#1E293B';
  const tooltipText = theme === 'dark' ? '#F0F6FF' : '#F8FAFC';

  const chartData = data
  .map((item) => ({
    name: item.employee_name,
    visits: item.total_orders,
  }))
  .reverse();

  return (
    <div className="h-44 md:h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
          <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} />
          <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={11} tickLine={false} width={100} />
          <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderRadius: '8px', border: 'none', color: tooltipText }} />
          <Bar 
            dataKey="visits" 
            fill="#8B5CF6" 
            radius={[0, 4, 4, 0]} 
            name="Orders Placed" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.45))' : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Most Ordered Items Chart (Horizontal Bar, Cafe Analytics)
export function MostOrderedItemsChart({ data = [] }: { data?: any[] }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const tooltipBg = theme === 'dark' ? '#0D1B2E' : '#1E293B';
  const tooltipText = theme === 'dark' ? '#F0F6FF' : '#F8FAFC';

  const chartData = data
  .map((item) => ({
    name: item.name,
    count: item.total_quantity,
  }))
  .reverse();

  return (
    <div className="h-44 md:h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
          <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} />
          <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={11} tickLine={false} width={90} />
          <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderRadius: '8px', border: 'none', color: tooltipText }} />
          <Bar 
            dataKey="count" 
            fill="#06B6D4" 
            radius={[0, 4, 4, 0]} 
            name="Units Sold" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.45))' : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Peak Order Times by Hour (Area Chart, Cafe Analytics)
export function PeakOrderTimesChart({ data = [] }: { data?: any[] }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const tooltipBg = theme === 'dark' ? '#0D1B2E' : '#1E293B';
  const tooltipText = theme === 'dark' ? '#F0F6FF' : '#F8FAFC';

const chartData = data.map((item) => ({
  hour: item.hour,
  Orders: item.total_orders,
}));

  return (
    <div className="h-44 md:h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis dataKey="hour" stroke="#64748B" fontSize={11} tickLine={false} />
          <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderRadius: '8px', border: 'none', color: tooltipText }} />
          <Area 
            type="monotone" 
            dataKey="Orders" 
            stroke="#3B82F6" 
            strokeWidth={2} 
            fillOpacity={1} 
            fill="url(#colorOrders)" 
            filter={theme === 'dark' ? 'drop-shadow(0 0 3px rgba(59, 130, 246, 0.3))' : undefined}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
