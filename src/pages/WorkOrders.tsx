import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WorkOrder, UserProfile, OSStatus, UserRole, Vehicle } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Filter,
  Car,
  ChevronRight,
  Clock,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  XCircle,
  AlertCircle,
  Calendar,
  User as UserIcon,
  X,
  Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { serverTimestamp, addDoc } from 'firebase/firestore';
import { sendPushNotification, createWorkOrder } from '../services/dataService';

export default function WorkOrders() {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [plates, setPlates] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<OSStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Quick Create OS States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchClientTerm, setSearchClientTerm] = useState('');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchWorkOrders();
  }, [filterStatus]);

  const fetchWorkOrders = async () => {
    setLoading(true);
    try {
      let q;
      if (filterStatus !== 'all') {
        q = query(collection(db, 'workOrders'), where('status', '==', filterStatus));
      } else {
        q = query(collection(db, 'workOrders'));
      }

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as WorkOrder));
      
      // In-memory sorting to prevent requiring composite index on status + createdAt desc
      orders.sort((a, b) => {
        const tA = (a.createdAt as any)?.toDate?.()?.getTime() || new Date(a.createdAt).getTime() || 0;
        const tB = (b.createdAt as any)?.toDate?.()?.getTime() || new Date(b.createdAt).getTime() || 0;
        return tB - tA;
      });

      setWorkOrders(orders);

      // Fetch plates and client names for these orders
      const plateMap: Record<string, string> = { ...plates };
      const clientMap: Record<string, string> = { ...clientNames };
      const vehicleIds = Array.from(new Set(orders.map(o => o.vehicleId)));
      const clientIds = Array.from(new Set(orders.map(o => o.clientId)));
      
      for (const vid of vehicleIds) {
        if (!vid || plateMap[vid]) continue;
        const vSnap = await getDoc(doc(db, 'vehicles', vid));
        if (vSnap.exists()) {
          plateMap[vid] = (vSnap.data() as Vehicle).licensePlate;
        }
      }

      for (const cid of clientIds) {
        if (!cid || clientMap[cid]) continue;
        const cSnap = await getDoc(doc(db, 'users', cid));
        if (cSnap.exists()) {
          clientMap[cid] = (cSnap.data() as UserProfile).name;
        }
      }

      setPlates(plateMap);
      setClientNames(clientMap);
    } catch (err) {
      console.error("Error fetching work orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchClients = async (val: string) => {
    setSearchClientTerm(val);
    if (val.length < 3) {
      setClients([]);
      return;
    }
    try {
      const q = query(collection(db, 'users'), where('role', '==', UserRole.CLIENT));
      const snap = await getDocs(q);
      const found = snap.docs
        .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
        .filter(c => c.name.toLowerCase().includes(val.toLowerCase()) || c.cpf?.includes(val));
      setClients(found);
    } catch (err) {
      console.error("Error searching clients:", err);
    }
  };

  const handleSelectClient = async (client: UserProfile) => {
    setSelectedClient(client);
    const q = query(collection(db, 'vehicles'), where('clientId', '==', client.uid));
    const snap = await getDocs(q);
    setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
  };

  const handleCreateOS = async (vehicleId: string) => {
    if (!selectedClient) return;
    setCreating(true);
    try {
      const result = await createWorkOrder(selectedClient.uid, vehicleId);
      
      const vehicleInfo = vehicles.find(v => v.id === vehicleId);

      // Notify Client (Push)
      try {
        await sendPushNotification(
          [selectedClient.uid],
          "🛠️ Ordem de Serviço Aberta",
          `Uma nova Ordem de Serviço foi aberta para o seu veículo ${vehicleInfo?.brand || ''} ${vehicleInfo?.model || ''} (${vehicleInfo?.licensePlate || ''}). ID: ${result.seqId}`,
          { osId: result.id }
        );
      } catch (notifyClientErr) {
        console.warn("Failed to notify client:", notifyClientErr);
      }

      // Notify staff (Mechanics and Admins)
      try {
        const staffSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', [UserRole.ADMIN, UserRole.MECHANIC])));
        const staffIds = staffSnap.docs.map(d => d.id);
        
        await sendPushNotification(
          staffIds,
          "🆕 Nova Ordem de Serviço",
          `Um novo serviço foi aberto para o veículo ${vehicleInfo?.licensePlate || ''}. ID: ${result.seqId}`,
          { osId: result.id }
        );
      } catch (notifyErr) {
        console.warn("Failed to notify staff:", notifyErr);
      }

      navigate(`/os/${result.id}`);
    } catch (err) {
      console.error("Error creating OS:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = ['Data', 'Cliente', 'Placa', 'Valor (R$)', 'Status', 'Mecânico'];
    const rows = filteredOrders.map(os => {
      const date = os.createdAt ? new Date((os.createdAt as any).toDate?.() || os.createdAt).toLocaleDateString('pt-BR') : 'Aguardando';
      const client = clientNames[os.clientId] || 'N/A';
      const plate = plates[os.vehicleId] || 'N/A';
      const value = (os.totalValue || 0).toFixed(2).replace('.', ',');
      const status = getStatusConfig(os.status).label;
      const mechanic = os.mechanicName || 'Aguardando';

      return [date, client, plate, value, status, mechanic].map(val => `"${val}"`).join(';');
    });

    const csvContent = "\uFEFF" + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ordens_de_servico_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusConfig = (status: OSStatus) => {
    switch (status) {
      case OSStatus.COMPLETED:
        return { icon: <CheckCircle2 size={14} />, label: 'Finalizada', classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
      case OSStatus.WAITING_PARTS:
        return { icon: <PauseCircle size={14} />, label: 'Aguard. Peça', classes: 'bg-amber-50 text-amber-600 border-amber-100' };
      case OSStatus.IN_PROGRESS:
        return { icon: <PlayCircle size={14} />, label: 'Em Manutenção', classes: 'bg-violet-50 text-violet-600 border-violet-100' };
      case OSStatus.CANCELLED:
        return { icon: <XCircle size={14} />, label: 'Cancelada', classes: 'bg-rose-50 text-rose-600 border-rose-100' };
      default:
        return { icon: <AlertCircle size={14} />, label: 'Aberta', classes: 'bg-blue-50 text-blue-600 border-blue-100' };
    }
  };

  const filteredOrders = workOrders.filter(os => {
    const searchLower = searchTerm.toLowerCase();
    const idMatches = os.id?.toLowerCase().includes(searchLower);
    const mechanicMatches = os.mechanicName?.toLowerCase().includes(searchLower);
    const plateMatches = plates[os.vehicleId]?.toLowerCase().includes(searchLower);
    return idMatches || mechanicMatches || plateMatches;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Ordens de Serviço</h1>
          <p className="text-gray-500 mt-1">Gerencie todos os atendimentos da oficina.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-gray-100 hover:bg-gray-50 text-gray-900 font-bold uppercase tracking-widest rounded-2xl shadow-sm transition-all whitespace-nowrap"
          >
            <Download size={20} />
            <span>Exportar CSV</span>
          </button>
          <button 
            onClick={() => {
              setSelectedClient(null);
              setSearchClientTerm('');
              setClients([]);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-black hover:bg-gray-800 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all"
          >
            <Plus size={24} />
            <span>Nova O.S.</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por OS, mecânico ou placa..." 
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <Filter className="text-gray-400 mr-2 shrink-0" size={20} />
          <FilterButton active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} label="Todas" />
          <FilterButton active={filterStatus === OSStatus.OPEN} onClick={() => setFilterStatus(OSStatus.OPEN)} label="Abertas" color="blue" />
          <FilterButton active={filterStatus === OSStatus.IN_PROGRESS} onClick={() => setFilterStatus(OSStatus.IN_PROGRESS)} label="Em Progresso" color="violet" />
          <FilterButton active={filterStatus === OSStatus.WAITING_PARTS} onClick={() => setFilterStatus(OSStatus.WAITING_PARTS)} label="Peças" color="amber" />
          <FilterButton active={filterStatus === OSStatus.COMPLETED} onClick={() => setFilterStatus(OSStatus.COMPLETED)} label="Concluídas" color="emerald" />
        </div>
      </div>

      {/* OS List */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-20 flex justify-center">
             <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {filteredOrders.map((os) => {
              const statusConfig = getStatusConfig(os.status);
              return (
                <div 
                  key={os.id} 
                  onClick={() => navigate(`/os/${os.id}`)}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-black transition-colors">
                      <Car size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${statusConfig.classes}`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                        <span className="text-xs font-mono font-black text-blue-600">{os.seqId || `ID #${os.id?.slice(-6).toUpperCase()}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {plates[os.vehicleId] && (
                          <span className="bg-gray-900 text-white px-2 py-0.5 rounded text-[10px] font-mono">
                            {plates[os.vehicleId]}
                          </span>
                        )}
                        <h3 className="font-bold text-gray-900 uppercase tracking-tight">
                          {os.mechanicName || 'Aguardando mecânico'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                           <Calendar size={10} /> {os.createdAt ? new Date((os.createdAt as any).toDate?.() || os.createdAt).toLocaleDateString('pt-BR') : 'Aguardando...'}
                         </span>
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                           <Clock size={10} /> {os.createdAt ? new Date((os.createdAt as any).toDate?.() || os.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Aguardando...'}
                         </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-2 sm:mt-0">
                    <div className="text-right">
                      <p className="text-lg font-black text-gray-900">R$ {os.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">+{os.totalPoints || 0} Pontos</p>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:text-black group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-20 text-center">
            <ClipboardList className="mx-auto text-gray-100 mb-4" size={64} />
            <h3 className="text-lg font-display font-bold text-gray-900 mb-2">Nenhuma Ordem de Serviço</h3>
            <p className="text-gray-400 max-w-xs mx-auto">Não encontramos ordens de serviço com os filtros atuais.</p>
          </div>
        )}
      </div>

      {/* OS Creation Modal (Same as Dashboard for consistency) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-display font-bold text-gray-900">Nova Ordem de Serviço</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 text-gray-400 hover:text-black rounded-xl">
                  <X size={24} />
                </button>
              </div>

              {!selectedClient ? (
                <div className="space-y-6">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input 
                      autoFocus type="text" placeholder="Pesquisar por nome ou CPF..." 
                      className="w-full pl-12 pr-4 py-5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all font-medium"
                      value={searchClientTerm} onChange={(e) => handleSearchClients(e.target.value)}
                    />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {clients.map(client => (
                      <button key={client.uid} onClick={() => handleSelectClient(client)} className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 border border-gray-100 rounded-2xl transition-all">
                        <div className="flex items-center gap-4 text-left">
                          <UserIcon className="text-gray-400" />
                          <div><p className="font-bold text-gray-900 uppercase">{client.name}</p></div>
                        </div>
                        <ChevronRight className="text-gray-300" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-black text-white rounded-2xl flex items-center justify-between">
                    <span>{selectedClient.name}</span>
                    <button onClick={() => setSelectedClient(null)} className="text-[10px] font-black uppercase underline">Trocar</button>
                  </div>
                  <div className="space-y-3">
                    {vehicles.map(v => (
                      <button key={v.id} disabled={creating} onClick={() => handleCreateOS(v.id!)} className="w-full flex items-center justify-between p-5 bg-gray-50 hover:bg-white border hover:border-black rounded-2xl transition-all group">
                        <div className="flex items-center gap-4 text-left">
                          <Car className="text-gray-400 group-hover:text-black" />
                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase">{v.brand} {v.model}</p>
                            <p className="font-bold text-gray-900">{v.licensePlate}</p>
                          </div>
                        </div>
                        {creating ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <ChevronRight />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterButton({ active, onClick, label, color = 'gray' }: { active: boolean, onClick: () => void, label: string, color?: string }) {
  const colors: Record<string, string> = {
    blue: active ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50',
    violet: active ? 'bg-violet-600 text-white' : 'bg-white text-violet-600 border-violet-100 hover:bg-violet-50',
    amber: active ? 'bg-amber-600 text-white' : 'bg-white text-amber-600 border-amber-100 hover:bg-amber-50',
    emerald: active ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50',
    gray: active ? 'bg-black text-white' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50',
  };

  return (
    <button 
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap border transition-all ${colors[color]}`}
    >
      {label}
    </button>
  );
}
