import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WorkOrder, UserProfile, OSStatus, Vehicle, Announcement, Redemption, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  History, 
  Car as CarIcon, 
  ChevronRight, 
  Gift, 
  Settings,
  CircleCheck,
  Clock,
  Bell,
  LogOut,
  LayoutDashboard,
  X,
  PlusCircle,
  HelpCircle,
  Bike
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSystemConfig, recoverOrphanedData } from '../services/dataService';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { CAR_BRANDS, MOTO_BRANDS } from '../constants';

export default function ClientPortal({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const [osHistory, setOsHistory] = useState<WorkOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeRedemptions, setActiveRedemptions] = useState<Redemption[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

  // Vehicle form state
  const [vType, setVType] = useState<'CAR' | 'MOTORCYCLE'>('CAR');
  const [vLicensePlate, setVLicensePlate] = useState('');
  const [vBrand, setVBrand] = useState('');
  const [vModel, setVModel] = useState('');
  const [vYear, setVYear] = useState(new Date().getFullYear());
  const [vColor, setVColor] = useState('');
  const [vEngine, setVEngine] = useState('');
  const [vSubmitting, setVSubmitting] = useState(false);

  const fetchVehicles = async () => {
    const vQuery = query(collection(db, 'vehicles'), where('clientId', '==', user.uid));
    const vSnap = await getDocs(vQuery);
    setVehicles(vSnap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vLicensePlate || !vBrand || !vModel) return alert('Por favor, preencha placa, marca e modelo.');
    
    setVSubmitting(true);
    try {
      await addDoc(collection(db, 'vehicles'), {
        clientId: user.uid,
        type: vType,
        licensePlate: vLicensePlate.toUpperCase(),
        brand: vBrand,
        model: vModel,
        year: vYear,
        color: vColor,
        engine: vEngine,
        createdAt: serverTimestamp()
      });
      
      setIsVehicleModalOpen(false);
      // Reset form
      setVLicensePlate('');
      setVBrand('');
      setVModel('');
      setVYear(new Date().getFullYear());
      setVColor('');
      setVEngine('');
      
      await fetchVehicles();
      alert('Veículo cadastrado com sucesso!');
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("Erro ao cadastrar veículo.");
    } finally {
      setVSubmitting(false);
    }
  };

  useEffect(() => {
    // Check if we should show the tour (first time this session or never seen)
    const seenTour = localStorage.getItem(`tour_${user.uid}`);
    if (!seenTour && vehicles.length === 0) {
      setShowTour(true);
    }
  }, [vehicles.length, user.uid]);

  useEffect(() => {
    async function fetchData() {
      // 0. CHECK FOR ORPHANED DATA (Self-healing migration)
      const isBootstrapAdmin = user.email?.toLowerCase() === 'mecanicarota430sta@gmail.com';
      const syncKey = `sync_${user.uid}`;
      const hasSynced = localStorage.getItem(syncKey);
      console.log(`[ClientPortal] Checking sync for ${user.uid}: hasSynced=${hasSynced}`);
      
      if (user.role === UserRole.CLIENT && !isBootstrapAdmin && hasSynced !== 'done') {
        setIsSyncing(true);
        try {
          console.log("[ClientPortal] Running recoverOrphanedData...");
          const merged = await recoverOrphanedData(user.uid, user.cpf, user.email);
          localStorage.setItem(syncKey, 'done');
          if (merged) {
            console.log("[ClientPortal] Data synchronization complete.");
          } else {
            console.log("[ClientPortal] No data to merge.");
          }
        } catch (err) {
          console.error("[ClientPortal] Sync error:", err);
        } finally {
          setIsSyncing(false);
        }
      } else {
        console.log("[ClientPortal] Sync skipped.");
      }

      try {
        const configData = await getSystemConfig();
        setConfig(configData);

        // Get OS History
        const osQuery = query(
          collection(db, 'workOrders'), 
          where('clientId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        // Get Vehicles
        const vQuery = query(collection(db, 'vehicles'), where('clientId', '==', user.uid));

        // Get Public Announcements
        const aQuery = query(
          collection(db, 'announcements'), 
          where('type', '==', 'PUBLIC'),
          orderBy('createdAt', 'desc'),
          limit(3)
        );

        // Get Approved Redemptions
        const rQuery = query(
          collection(db, 'redemptions'),
          where('clientId', '==', user.uid),
          where('status', '==', 'APPROVED'),
          orderBy('createdAt', 'desc')
        );

        const [osSnap, vSnap, aSnap, rSnap] = await Promise.all([
          getDocs(osQuery),
          getDocs(vQuery),
          getDocs(aQuery),
          getDocs(rQuery)
        ]);

        setOsHistory(osSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder)));
        setVehicles(vSnap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
        setAnnouncements(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
        setActiveRedemptions(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)));
      } catch (err) {
        console.error("[ClientPortal] Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user.uid]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest animate-pulse">Sincronizando portal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Welcome & Points */}
      <section className="bg-black rounded-3xl p-8 text-white shadow-2xl shadow-gray-200">
        <div className="flex justify-between items-start">
          <div>
             <h1 className="text-2xl font-bold font-display">Olá, {user.name.split(' ')[0]}!</h1>
             <p className="text-gray-400 text-sm mt-1">Bem-vindo à {config?.shopName || 'Rota 430'}</p>
             {user.cpf && (
               <p className="text-[10px] text-gray-500 font-mono mt-1 uppercase tracking-widest">{user.cpf}</p>
             )}
          </div>
          <div className="flex gap-2">
            {user.role === 'ADMIN' && (
              <button 
                onClick={() => window.location.href = '/'}
                className="p-3 bg-white/10 rounded-2xl hover:bg-white text-white hover:text-black transition-all flex items-center gap-2 text-xs font-bold"
                title="Voltar ao Painel Administrativo"
              >
                <LayoutDashboard size={18} />
                <span className="hidden md:inline">Admin</span>
              </button>
            )}
            <button 
              onClick={() => navigate('/perfil')}
              className="p-3 bg-white/5 rounded-2xl hover:bg-white/20 text-white transition-all"
              title="Configurações de Perfil"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={() => {
                if (window.confirm('Deseja realmente sair?')) {
                  signOut(auth).then(() => navigate('/login'));
                }
              }}
              className="p-3 bg-white/5 rounded-2xl hover:bg-rose-500/20 text-white hover:text-rose-400 transition-all"
              title="Sair do sistema"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <div className="bg-white/5 p-5 rounded-2xl flex items-center gap-4 flex-1 border border-white/10">
             <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-black">
                <Trophy size={28} />
             </div>
             <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saldo Total</span>
                <p className="text-4xl font-bold font-mono leading-none mt-1">{user.points || 0}</p>
             </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/premios')}
            className="h-full px-8 bg-white text-black font-bold rounded-2xl flex flex-col items-center justify-center shadow-lg"
          >
            <Gift size={24} />
            <span className="text-xs mt-1">Resgatar</span>
          </motion.button>
        </div>
      </section>

      {/* Rewards Notifications */}
      {activeRedemptions.length > 0 && (
        <section className="bg-amber-100 border-2 border-amber-200 rounded-3xl p-6 text-amber-900 shadow-xl shadow-amber-50 animate-bounce-subtle">
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-amber-200 rounded-2xl flex items-center justify-center">
                <Gift className="text-amber-700" size={32} />
             </div>
             <div className="flex-1">
                <h2 className="text-lg font-black uppercase tracking-tight">Prêmio Disponível!</h2>
                <p className="text-sm text-amber-800 font-medium">Seu pedido de resgate foi aprovado! Venha retirar seu brinde na recepção.</p>
             </div>
             <button 
               onClick={() => navigate('/premios')}
               className="px-6 py-3 bg-amber-900 text-white font-bold rounded-xl text-sm"
             >
                Ver Detalhes
             </button>
          </div>
        </section>
      )}

      {/* Announcements */}
      {announcements.length > 0 && (
        <section className="bg-blue-600 rounded-3xl p-6 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Bell size={80} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
               <Bell size={18} />
               <h2 className="text-sm font-black uppercase tracking-widest">Avisos da Oficina</h2>
            </div>
            {announcements.map((ann) => (
              <div key={ann.id} className="mb-4 last:mb-0">
                <h3 className="font-bold text-lg mb-1">{ann.title}</h3>
                <p className="text-sm text-blue-100">{ann.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vehicles Horizontal List */}
      <section id="tour-vehicles">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-display font-bold text-gray-900">Meus Veículos</h2>
          <button 
            onClick={() => setIsVehicleModalOpen(true)}
            className="text-blue-600 text-sm font-semibold flex items-center gap-1"
          >
            <PlusCircle size={16} />
            Cadastrar
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {vehicles.length > 0 ? vehicles.map((v) => (
            <div key={v.id} className="min-w-[240px] bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
               <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500">
                  <CarIcon size={24} />
               </div>
               <div>
                  <p className="font-bold text-gray-900 uppercase tracking-tight">{v.licensePlate}</p>
                  <p className="text-xs text-gray-500 uppercase">{v.brand} {v.model}</p>
               </div>
            </div>
          )) : (
             <div className="w-full p-8 bg-gray-50 rounded-2xl text-center text-gray-500 text-sm border-2 border-dashed border-gray-200">
                Nenhum veículo cadastrado.
             </div>
          )}
        </div>
      </section>

      {/* OS History */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-display font-bold text-gray-900">Últimos Serviços</h2>
          <History size={20} className="text-gray-300" />
        </div>
        <div className="space-y-4">
          {osHistory.length > 0 ? osHistory.map((os) => (
            <motion.div 
               key={os.id} 
               whileHover={{ x: 4 }}
               onClick={() => navigate(`/os/${os.id}`)}
               className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer group transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  os.status === OSStatus.COMPLETED ? 'bg-green-50 bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {os.status === OSStatus.COMPLETED ? <CircleCheck size={24} /> : <Clock size={24} />}
                </div>
                <div>
                   <div className="flex items-center gap-2">
                     <p className="font-bold text-gray-900">{os.seqId || `OS #${os.id?.slice(-4).toUpperCase()}`}</p>
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        os.status === OSStatus.COMPLETED ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                     }`}>
                        {os.status === OSStatus.COMPLETED ? 'Concluída' : 'Em curso'}
                     </span>
                   </div>
                   <div className="flex items-center gap-2 mt-1">
                      {vehicles.find(v => v.id === os.vehicleId) && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                          {vehicles.find(v => v.id === os.vehicleId)?.licensePlate}
                        </span>
                      )}
                      <p className="text-xs text-gray-400 capitalize">
                         {new Date(os.createdAt?.toDate?.() || os.createdAt).toLocaleDateString('pt-BR')} 
                         {' • '} 
                         {os.services ? os.services[0] : 'Serviço GERAL'}
                      </p>
                   </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-600 transition-colors" />
            </motion.div>
          )) : (
            <div className="p-8 text-center text-gray-400 text-sm italic">
               Nenhum histórico disponível.
            </div>
          )}
        </div>
      </section>

      {/* Guided Tour Modal */}
      <AnimatePresence>
        {showTour && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="bg-blue-600 p-8 text-white relative">
                <button 
                  onClick={() => setShowTour(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                  <HelpCircle size={32} />
                </div>
                <h2 className="text-2xl font-bold font-display">Bem-vindo à Rota 430!</h2>
                <p className="text-blue-100 text-sm mt-2 font-medium">Vamos te explicar como funciona sua conta e como ganhar pontos.</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="flex gap-4">
                   <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                      <Trophy size={20} />
                   </div>
                   <div>
                      <h4 className="font-bold text-gray-900">Acumule Pontos</h4>
                      <p className="text-xs text-gray-500">Cada R$ 1,00 gasto em serviços se torna 1 ponto. Troque seus pontos por prêmios exclusivos na aba "Resgatar".</p>
                   </div>
                </div>

                <div className="flex gap-4">
                   <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      <CarIcon size={20} />
                   </div>
                   <div>
                      <h4 className="font-bold text-gray-900">Cadastre seu Veículo</h4>
                      <p className="text-xs text-gray-500">Adicione seus carros para que possamos te avisar sobre revisões e manutenções preventivas via WhatsApp.</p>
                   </div>
                </div>

                <div className="flex gap-4">
                   <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                      <History size={20} />
                   </div>
                   <div>
                      <h4 className="font-bold text-gray-900">Histórico Transparente</h4>
                      <p className="text-xs text-gray-500">Acompanhe todas as suas ordens de serviço, peças trocadas e o status atual do seu carro em tempo real.</p>
                   </div>
                </div>

                <button 
                  onClick={() => {
                    localStorage.setItem(`tour_${user.uid}`, 'done');
                    setShowTour(false);
                  }}
                  className="w-full py-4 bg-black text-white font-bold rounded-2xl shadow-xl hover:bg-gray-900 transition-all active:scale-95"
                >
                  Entendi, vamos começar!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Vehicle Registration Modal */}
      <AnimatePresence>
        {isVehicleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsVehicleModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-xl bg-white rounded-[2rem] shadow-2xl overflow-hidden p-8 border border-white/20 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-display font-bold text-gray-900">Cadastrar Veículo</h2>
                <button onClick={() => setIsVehicleModalOpen(false)} className="p-2 text-gray-400 hover:text-black"><X size={24} /></button>
              </div>

              <form onSubmit={handleAddVehicle} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button" 
                    onClick={() => setVType('CAR')}
                    className={`py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${vType === 'CAR' ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'}`}
                  >
                    <CarIcon size={24} />
                    <span className="text-xs font-black uppercase tracking-widest">Carro</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setVType('MOTORCYCLE')}
                    className={`py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${vType === 'MOTORCYCLE' ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'}`}
                  >
                    <Bike size={24} />
                    <span className="text-xs font-black uppercase tracking-widest">Moto</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Placa</label>
                    <input 
                      required 
                      type="text" 
                      value={vLicensePlate} 
                      onChange={(e) => setVLicensePlate(e.target.value)} 
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-mono font-bold uppercase text-center text-lg" 
                      placeholder="AAA-0000" 
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Ano</label>
                    <input required type="number" value={vYear} onChange={(e) => setVYear(Number(e.target.value))} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-mono font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Marca</label>
                    <select 
                      required
                      value={(vBrand && (vType === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(vBrand)) ? vBrand : (vBrand ? 'OTHER' : '')} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'OTHER') setVBrand(' ');
                        else setVBrand(val);
                      }} 
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium"
                    >
                      <option value="">Selecione...</option>
                      {(vType === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                      <option value="OTHER">Outra...</option>
                    </select>
                    {vBrand && !((vType === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(vBrand)) && (
                      <input 
                        required 
                        type="text" 
                        value={vBrand.trim()} 
                        onChange={(e) => setVBrand(e.target.value)} 
                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all mt-2 font-medium" 
                        placeholder="Digite a marca" 
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Modelo</label>
                    <input required type="text" value={vModel} onChange={(e) => setVModel(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium" placeholder="Ex: Corolla" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cor</label>
                    <input type="text" value={vColor} onChange={(e) => setVColor(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium" placeholder="Prata" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Motor / Versão</label>
                    <input type="text" value={vEngine} onChange={(e) => setVEngine(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium" placeholder="1.8 VVT-i" />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit" 
                    disabled={vSubmitting}
                    className="w-full py-5 bg-black text-white font-black uppercase tracking-widest rounded-2xl hover:bg-gray-900 transition-all flex items-center justify-center shadow-xl shadow-black/10 active:scale-95 disabled:opacity-50"
                  >
                    {vSubmitting ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Finalizar Cadastro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
