import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, updateDoc, doc, runTransaction, increment, serverTimestamp } from 'firebase/firestore';
import { WorkOrder, UserProfile, Vehicle, ServiceItem, OSStatus, SystemConfig, Redemption, ReminderRecord } from '../types';
import { Bell, Search, MessageCircle, Calendar, Hash, Car, Bike, User as UserIcon, Clock, AlertCircle, Gift, Check, X, History, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSystemConfig, MaintenanceReminder, syncReminders, getRemindersHistory, updateReminderStatus } from '../services/dataService';

export default function Reminders() {
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [pendingRedemptions, setPendingRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReminderRecord['status'] | 'ALL'>('ALL');
  const [config, setConfig] = useState<SystemConfig | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const configData = await getSystemConfig();
      setConfig(configData as SystemConfig);

      // Sincroniza novos lembretes antes de carregar
      await syncReminders();
      
      // Carrega registros reais do banco
      const history = await getRemindersHistory();
      setReminders(history);

      // Fetch Pending Redemptions
      const qRed = query(collection(db, 'redemptions'), where('status', '==', 'PENDING'));
      const snapRed = await getDocs(qRed);
      const reds = snapRed.docs.map(d => ({ id: d.id, ...d.data() } as Redemption));
      setPendingRedemptions(reds);
    } catch (error) {
      console.error("Error fetching reminders:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleRedemptionAction = async (red: Redemption, newStatus: 'APPROVED' | 'REJECTED') => {
    try {
      if (newStatus === 'REJECTED') {
        await runTransaction(db, async (transaction) => {
          transaction.update(doc(db, 'redemptions', red.id!), { 
            status: 'REJECTED', 
            updatedAt: serverTimestamp() 
          });
          transaction.update(doc(db, 'users', red.clientId), { 
            points: increment(red.pointCost) 
          });
        });
      } else {
        await runTransaction(db, async (transaction) => {
          const prizeRef = doc(db, 'prizes', red.prizeId);
          const prizeSnap = await transaction.get(prizeRef);
          if (!prizeSnap.exists() || prizeSnap.data().stock <= 0) throw new Error("Estoque esgotado");

          transaction.update(doc(db, 'redemptions', red.id!), { 
            status: 'APPROVED', 
            updatedAt: serverTimestamp() 
          });
          transaction.update(prizeRef, { stock: increment(-1) });
        });

        // Prompt for WhatsApp notification
        setTimeout(() => {
          if (window.confirm(`Resgate aprovado! Deseja notificar o cliente ${red.clientName || 'no WhatsApp'}?`)) {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + 30);
            const deadlineStr = deadline.toLocaleDateString('pt-BR');
            
            const message = `Olá ${red.clientName || ''}, resgate do brinde ${red.prizeName || 'solicitado'}, seu pedido de resgate foi aprovado. Venha até a loja até o dia ${deadlineStr} para retirar o seu brinde.`;
            
            const phone = red.clientPhone?.replace(/\D/g, '');
            if (phone) {
              const url = `https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(message)}`;
              window.open(url, '_blank');
            } else {
              alert("O cliente não possui telefone cadastrado para o envio automático.");
            }
          }
        }, 500);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message || "Erro ao processar");
    }
  };

  const sendWhatsApp = async (reminder: ReminderRecord) => {
    const phone = reminder.clientPhone?.replace(/\D/g, '');
    if (!phone) {
      alert('Cliente não possui telefone cadastrado.');
      return;
    }

    let message = '';
    
    if (reminder.type === 'BIRTHDAY') {
       const template = config?.whatsappBirthdayTemplate || `Olá {{name}}, tudo bem? Aqui é da {{shop}}.
Passando para te desejar um Feliz Aniversário! Muita saúde, paz e muitos quilômetros de felicidade. Parabéns pelo seu dia! 🎂🚀`;
       
       message = template
         .replace(/{{name}}/g, reminder.clientName.split(' ')[0])
         .replace(/{{shop}}/g, config?.shopName || 'Oficina');
    } else {
      const lastDate = reminder.lastServiceDate?.toDate ? reminder.lastServiceDate.toDate() : new Date(reminder.lastServiceDate);
      const now = new Date();
      
      // Cálculo detalhado do período
      const diffTime = Math.abs(now.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const monthsPassed = Math.floor(diffDays / 30.44);
      const yearsPassed = Math.floor(monthsPassed / 12);
      const remainingMonths = monthsPassed % 12;

      let timePeriod = '';
      if (yearsPassed > 0) {
        timePeriod = yearsPassed === 1 ? '1 ano' : `${yearsPassed} anos`;
        if (remainingMonths > 0) {
          timePeriod += remainingMonths === 1 ? ' e 1 mês' : ` e ${remainingMonths} meses`;
        }
      } else {
        timePeriod = monthsPassed <= 1 ? 'aproximadamente 1 mês' : `${monthsPassed} meses`;
      }
      
      const kmPassed = reminder.vehicleId ? (reminder.lastMileage || 0) : 0;
      
      const defaultTemplate = `Olá {{name}}, faz {{time}} que você realizou o serviço de {{service}} no seu veículo {{vehicle}} (Placa {{plate}}). Passando para lembrar que pode ser o momento de uma nova revisão na {{shop}}!`;
      const template = config?.whatsappTemplate || defaultTemplate;
      
      message = template
        .replace(/{{name}}/g, reminder.clientName.split(' ')[0])
        .replace(/{{vehicle}}/g, reminder.vehicleModel || '')
        .replace(/{{plate}}/g, reminder.vehiclePlate || '')
        .replace(/{{service}}/g, reminder.serviceName)
        .replace(/{{months}}/g, monthsPassed.toString())
        .replace(/{{time}}/g, timePeriod)
        .replace(/{{timing}}/g, timePeriod)
        .replace(/{{km}}/g, kmPassed.toString())
        .replace(/{{shop}}/g, config?.shopName || 'Oficina');
    }

    const url = `https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');

    // Update status in DB
    const newStatus = reminder.status === 'MISSED' ? 'DELAYED_SENT' : 'SENT';
    await updateReminderStatus(reminder.id!, newStatus);
    
    // Optimistic update
    setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, status: newStatus, sentAt: new Date() } : r));
  };

  const getStatusConfig = (status: ReminderRecord['status']) => {
    switch (status) {
      case 'SENT': return { label: 'Enviado', color: 'bg-emerald-100 text-emerald-700', icon: <Check size={12} /> };
      case 'DELAYED_SENT': return { label: 'Envio Atrasado', color: 'bg-blue-100 text-blue-700', icon: <History size={12} /> };
      case 'MISSED': return { label: 'Não Enviado', color: 'bg-red-100 text-red-700', icon: <X size={12} /> };
      case 'PENDING': return { label: 'Pendente', color: 'bg-amber-100 text-amber-700', icon: <Clock size={12} /> };
      default: return { label: 'Pendente', color: 'bg-gray-100 text-gray-700', icon: <Clock size={12} /> };
    }
  };

  const filteredReminders = reminders.filter(r => {
    const matchesSearch = 
      r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.vehicleModel?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (r.vehiclePlate?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      r.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'ALL' || r.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Histórico de Lembretes</h1>
          <p className="text-gray-500 mt-1">Acompanhe todos os avisos de manutenção e aniversários enviados ou pendentes.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por cliente, placa, modelo ou serviço..." 
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl overflow-x-auto no-scrollbar">
          {['ALL', 'PENDING', 'SENT', 'DELAYED_SENT', 'MISSED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status as any)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                filterStatus === status ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-gray-200'
              }`}
            >
              {status === 'ALL' ? 'Todos' : getStatusConfig(status as any).label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {pendingRedemptions.map((red) => (
              <motion.div 
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={red.id} 
                className="bg-amber-50 p-6 rounded-3xl shadow-sm border-2 border-amber-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                      <Gift size={24} />
                    </div>
                    <span className="bg-amber-200 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                      Solicitação de Resgate
                    </span>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <h3 className="font-display font-bold text-lg text-amber-900 leading-tight italic">
                        {red.prizeName || 'Resgate de Pontos'}
                      </h3>
                      <p className="text-sm text-amber-700 mt-1 flex items-center gap-1 uppercase tracking-tighter font-bold">
                         <Clock size={14} /> Aguardando Aprovação
                      </p>
                    </div>

                    <div className="p-3 bg-white/60 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <UserIcon size={16} className="text-amber-400" />
                        <span className="font-bold text-amber-900">{red.clientName || 'Cliente'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                         <Hash size={16} className="text-amber-400" />
                         <span className="font-medium text-amber-800">{red.pointCost} Pontos</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                   <button 
                    onClick={() => handleRedemptionAction(red, 'APPROVED')}
                    className="flex-1 py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                   >
                     <Check size={18} /> Aprovar
                   </button>
                   <button 
                    onClick={() => handleRedemptionAction(red, 'REJECTED')}
                    className="px-4 py-3 bg-white text-red-600 border border-red-100 font-bold rounded-xl hover:bg-red-50 transition-all"
                   >
                     <X size={18} />
                   </button>
                </div>
              </motion.div>
            ))}

            {filteredReminders.map((reminder) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={reminder.id} 
                className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-black">
                      {reminder.type === 'BIRTHDAY' ? <Gift size={24} className="text-rose-500" /> : <Bell size={24} />}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`${getStatusConfig(reminder.status).color} text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1`}>
                        {getStatusConfig(reminder.status).icon}
                        {getStatusConfig(reminder.status).label}
                      </span>
                      {reminder.sentAt && (
                        <span className="text-[9px] text-gray-400 uppercase font-black">
                          {reminder.sentAt?.toDate ? reminder.sentAt.toDate().toLocaleDateString() : new Date(reminder.sentAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <h3 className="font-display font-bold text-lg text-gray-900 leading-tight">
                        {reminder.type === 'BIRTHDAY' ? `Parabéns, ${reminder.clientName.split(' ')[0]}!` : reminder.serviceName}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 flex items-center gap-1 uppercase tracking-tighter italic">
                         <Calendar size={14} /> 
                         {reminder.type === 'BIRTHDAY' ? `Aniversário: ${reminder.lastServiceDate?.toDate ? reminder.lastServiceDate.toDate().toLocaleDateString() : new Date(reminder.lastServiceDate).toLocaleDateString()}` : `Última vez: ${reminder.lastServiceDate?.toDate ? reminder.lastServiceDate.toDate().toLocaleDateString() : new Date(reminder.lastServiceDate).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <UserIcon size={16} className="text-gray-400" />
                        <span className="font-bold text-gray-700">{reminder.clientName}</span>
                      </div>
                      {reminder.type !== 'BIRTHDAY' && reminder.vehiclePlate && (
                        <div className="flex items-center gap-2 text-sm">
                          <Car size={16} className="text-gray-400" />
                          <span className="font-medium text-gray-600">{reminder.vehicleModel}</span>
                          <span className="bg-white px-2 py-0.5 rounded border border-gray-200 text-[10px] font-black uppercase tracking-widest">{reminder.vehiclePlate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={() => sendWhatsApp(reminder)}
                    className={`w-full py-4 ${reminder.status === 'SENT' || reminder.status === 'DELAYED_SENT' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-[#25D366] text-white hover:bg-[#20ba59] shadow-xl shadow-green-100'} font-bold rounded-2xl transition-all flex items-center justify-center gap-2`}
                  >
                    <MessageCircle size={20} />
                    <span>{reminder.status === 'MISSED' ? 'Enviar Mensagem Atrasada' : 'Enviar Aviso WhatsApp'}</span>
                  </button>
                  
                  {reminder.status === 'MISSED' && (
                    <p className="text-[10px] text-center text-red-500 font-bold uppercase tracking-tight">Este lembrete expirou sem envio automático.</p>
                  )}
                </div>
              </motion.div>
            ))}

            {pendingRedemptions.length === 0 && filteredReminders.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-200">
                  <Bell size={40} />
                </div>
                <p className="text-gray-500 font-medium">
                  Nenhum registro encontrado no histórico.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
