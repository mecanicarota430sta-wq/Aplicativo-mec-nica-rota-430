import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WorkOrder, UserProfile, OSStatus, SystemConfig, Vehicle, UserRole } from '../types';
import { motion } from 'motion/react';
import { 
  History,
  TrendingUp,
  AlertCircle,
  MessageCircle,
  Clock,
  CheckCircle2,
  Users,
  ChevronRight,
  DollarSign,
  Briefcase,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Dashboard({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    monthlyRevenue: 0,
    prevMonthRevenue: 0,
    activeOS: 0,
    completedToday: 0,
    averageTicket: 0,
    totalClients: 0,
    activeClientsToday: 0
  });
  const [mechanicPerformance, setMechanicPerformance] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        // Fetch all work orders for performance calculation (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const q = query(
          collection(db, 'workOrders'), 
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder));

        // Basic Stats
        const currentMonthOrders = allOrders.filter(o => {
          const date = new Date(o.completedAt?.toDate?.() || o.createdAt?.toDate?.() || 0);
          return date >= startOfMonth && o.status === OSStatus.COMPLETED;
        });

        const prevMonthOrders = allOrders.filter(o => {
          const date = new Date(o.completedAt?.toDate?.() || o.createdAt?.toDate?.() || 0);
          return date >= startOfPrevMonth && date < startOfMonth && o.status === OSStatus.COMPLETED;
        });

        const monthlyRevenue = currentMonthOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
        const prevMonthRevenue = prevMonthOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const completedToday = allOrders.filter(o => {
          const date = new Date(o.completedAt?.toDate?.() || 0);
          return date >= today && o.status === OSStatus.COMPLETED;
        }).length;

        // Mechanic Performance
        const mechMap: Record<string, { count: number, revenue: number }> = {};
        allOrders.forEach(o => {
          if (o.status === OSStatus.COMPLETED && o.mechanicName) {
            if (!mechMap[o.mechanicName]) mechMap[o.mechanicName] = { count: 0, revenue: 0 };
            mechMap[o.mechanicName].count++;
            mechMap[o.mechanicName].revenue += (o.totalValue || 0);
          }
        });

        const sortedPerformance = Object.entries(mechMap)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.revenue - a.revenue);

        setMechanicPerformance(sortedPerformance);

        // Chart Data (Last 6 months)
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthLabel = months[d.getMonth()];
          const monthRev = allOrders.filter(o => {
            const od = new Date(o.completedAt?.toDate?.() || 0);
            return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear() && o.status === OSStatus.COMPLETED;
          }).reduce((sum, o) => sum + (o.totalValue || 0), 0);
          chartData.push({ name: monthLabel, revenue: monthRev });
        }
        setRevenueData(chartData);

        // Fetch Clients for Stats
        const clientsQuery = query(collection(db, 'users'), where('role', '==', UserRole.CLIENT));
        const clientsSnap = await getDocs(clientsQuery);
        const totalClients = clientsSnap.size;
        
        const activeClientsToday = clientsSnap.docs.filter(d => {
          const lastActive = d.data().lastActive?.toDate?.() || new Date(0);
          return lastActive >= today;
        }).length;

        setStats({
          monthlyRevenue,
          prevMonthRevenue,
          activeOS: allOrders.filter(o => o.status !== OSStatus.COMPLETED && o.status !== OSStatus.CANCELLED).length,
          completedToday,
          averageTicket: currentMonthOrders.length > 0 ? monthlyRevenue / currentMonthOrders.length : 0,
          totalClients,
          activeClientsToday
        });

        setRecentActivities(allOrders.slice(0, 5));
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  if (loading) return (
    <div className="p-8 flex justify-center items-center h-[60vh]">
      <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const revenueGrowth = stats.prevMonthRevenue > 0 
    ? ((stats.monthlyRevenue - stats.prevMonthRevenue) / stats.prevMonthRevenue) * 100 
    : 0;

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Dashboard Executivo</h1>
          <p className="text-gray-500 mt-1">Visão geral do desempenho da oficina.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.location.href = '/?view=client'} 
            className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 font-bold rounded-2xl hover:bg-blue-100 transition-all border border-blue-100 shadow-sm"
            title="Visualizar o painel como um cliente"
          >
            <Users size={20} />
            <span>Ver como Cliente</span>
          </button>
        </div>
      </header>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatItem 
          icon={<DollarSign className="text-emerald-600" />} 
          label="Faturamento Mês" 
          value={`R$ ${stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue={
            <div className="flex flex-col gap-1">
              <span className={`flex items-center gap-1 ${revenueGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {revenueGrowth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(revenueGrowth).toFixed(1)}% vs mês ant.
              </span>
            </div>
          }
        />
        <StatItem 
          icon={<Briefcase className="text-blue-600" />} 
          label="Serviços Ativos" 
          value={stats.activeOS.toString()}
          subValue="Em andamento na oficina"
        />
        <StatItem 
          icon={<CheckCircle2 className="text-violet-600" />} 
          label="Finalizados Hoje" 
          value={stats.completedToday.toString()}
          subValue="Entregues ao cliente"
        />
        <StatItem 
          icon={<TrendingUp className="text-amber-600" />} 
          label="Ticket Médio" 
          value={`R$ ${stats.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue="Média por serviço"
        />
        <StatItem 
          icon={<Users className="text-indigo-600" />} 
          label="Total de Clientes" 
          value={stats.totalClients.toString()}
          subValue="Cadastrados no sistema"
        />
        <StatItem 
          icon={<UserPlus className="text-rose-600" />} 
          label="Ativos Hoje" 
          value={stats.activeClientsToday.toString()}
          subValue="Interagiram com a plataforma"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm shadow-blue-500/5">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display font-bold text-xl text-gray-900">Histórico de Faturamento</h2>
            <select className="bg-gray-50 border-none rounded-xl text-xs font-black uppercase tracking-widest px-4 py-2 outline-none">
              <option>Últimos 6 meses</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                  tickFormatter={(val) => `R$ ${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [`R$ ${val.toLocaleString('pt-BR')}`, 'Faturamento']}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                  {revenueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === revenueData.length - 1 ? '#000' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mechanic Ranking */}
        <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <Trophy className="text-amber-500" />
            <h2 className="font-display font-bold text-xl text-gray-900">Rank da Equipe</h2>
          </div>
          <div className="space-y-4">
            {mechanicPerformance.map((mech, idx) => (
              <div key={mech.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-black transition-all">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg ${idx === 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-500'}`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{mech.name}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">{mech.count} OS Concluídas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-emerald-600 font-mono">R$ {mech.revenue.toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
            {mechanicPerformance.length === 0 && (
              <p className="text-center py-12 text-gray-400 text-sm italic">Nenhum dado de produtividade disponível.</p>
            )}
          </div>
          <button 
            onClick={() => navigate('/equipe')}
            className="w-full mt-6 py-4 border border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black hover:border-black transition-all"
          >
            Ver Gestão de Equipe
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Activity Mini-List */}
        <div className="lg:col-span-12 bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <History className="text-gray-400" />
              <h2 className="font-display font-bold text-xl text-gray-900">Atividade Recente</h2>
            </div>
            <button 
              onClick={() => navigate('/os')}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-1"
            >
              Gerenciar Todas <ChevronRight size={12} />
            </button>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">
                  <th className="pb-4 px-4">OS</th>
                  <th className="pb-4 px-4">Status</th>
                  <th className="pb-4 px-4">Mecânico</th>
                  <th className="pb-4 px-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentActivities.map((os) => (
                  <tr 
                    key={os.id} 
                    onClick={() => navigate(`/os/${os.id}`)}
                    className="group cursor-pointer hover:bg-gray-50"
                  >
                    <td className="py-4 px-4">
                      <p className="text-xs font-black text-gray-900 uppercase">{os.seqId || `OS #${os.id?.slice(-6).toUpperCase()}`}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{new Date(os.createdAt?.toDate?.() || os.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-tighter ${
                        os.status === OSStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {os.status === OSStatus.COMPLETED ? 'Finalizada' : 'Em Aberto'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-bold text-gray-700">{os.mechanicName || '—'}</p>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <p className="text-xs font-black text-gray-900">R$ {os.totalValue?.toLocaleString('pt-BR')}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: string, subValue: React.ReactNode }) {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all">
      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <h3 className="text-2xl font-display font-black text-gray-900">{value}</h3>
      <div className="mt-4 text-[10px] font-bold text-gray-400 tracking-tight">
        {subValue}
      </div>
    </div>
  );
}
