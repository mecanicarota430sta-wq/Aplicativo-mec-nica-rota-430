import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp, 
  orderBy, 
  where,
  increment,
  runTransaction
} from 'firebase/firestore';
import { Prize, Redemption, UserProfile, UserRole, OperationType } from '../types';
import { 
  Trophy, 
  Plus, 
  Edit2, 
  Trash2, 
  Gift, 
  Package, 
  Coins, 
  X, 
  ChevronRight,
  CheckCircle2,
  Clock,
  Search,
  History,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Rewards({ user }: { user: UserProfile }) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<Prize | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState<Prize | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointCost, setPointCost] = useState(0);
  const [stock, setStock] = useState(0);
  const [imageUrl, setImageUrl] = useState('');

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.MECHANIC;

  useEffect(() => {
    fetchPrizes();
    if (!isAdmin) {
      fetchMyRedemptions();
    } else {
      fetchAllRedemptions();
    }
  }, [isAdmin, user.uid]);

  const fetchPrizes = async () => {
    try {
      const q = query(collection(db, 'prizes'), orderBy('pointCost', 'asc'));
      const snapshot = await getDocs(q);
      setPrizes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Prize)));
    } catch (err) {
      console.error("Error fetching prizes:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRedemptions = async () => {
    try {
      const q = query(
        collection(db, 'redemptions'), 
        where('clientId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      setRedemptions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)));
    } catch (err) {
      console.error("Error fetching my redemptions:", err);
    }
  };

  const fetchAllRedemptions = async () => {
    try {
      const q = query(collection(db, 'redemptions'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setRedemptions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)));
    } catch (err) {
      console.error("Error fetching redemptions:", err);
    }
  };

  const handleOpenModal = (prize?: Prize) => {
    if (prize) {
      setEditingPrize(prize);
      setName(prize.name);
      setDescription(prize.description);
      setPointCost(prize.pointCost);
      setStock(prize.stock);
      setImageUrl(prize.imageUrl || '');
    } else {
      setEditingPrize(null);
      setName('');
      setDescription('');
      setPointCost(0);
      setStock(0);
      setImageUrl('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingPrize) {
        await updateDoc(doc(db, 'prizes', editingPrize.id!), {
          name,
          description,
          pointCost,
          stock,
          imageUrl,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'prizes'), {
          name,
          description,
          pointCost,
          stock,
          imageUrl,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      fetchPrizes();
    } catch (err) {
      console.error("Error saving prize:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir este prêmio?')) {
      try {
        await deleteDoc(doc(db, 'prizes', id));
        fetchPrizes();
      } catch (err) {
        console.error("Error deleting prize:", err);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800 * 1024) { // 800KB limit for base64 in Firestore
        alert('A imagem é muito pesada. Tente usar uma foto com menos qualidade ou menor (máximo 800KB).');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRedeem = async () => {
    if (!selectedPrize) return;
    const prize = selectedPrize;
    
    if (user.points < prize.pointCost) {
      alert('Você não possui pontos suficientes.');
      return;
    }
    if (prize.stock <= 0) {
      alert('Prêmio fora de estoque.');
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("Usuário não encontrado");
        
        const currentPoints = userDoc.data().points || 0;
        if (currentPoints < prize.pointCost) throw new Error("Pontos insuficientes");

        transaction.update(userRef, { points: increment(-prize.pointCost) });
        
        const redRef = doc(collection(db, 'redemptions'));
        transaction.set(redRef, {
          clientId: user.uid,
          clientName: user.name,
          clientPhone: user.phone || '',
          prizeId: prize.id,
          prizeName: prize.name,
          pointCost: prize.pointCost,
          status: 'PENDING',
          createdAt: serverTimestamp()
        });
      });

      setShowConfirmModal(false);
      alert('Solicitação de resgate enviada! Aguarde a aprovação do administrador.');
      fetchPrizes();
      fetchMyRedemptions();
      window.location.reload(); 
    } catch (err) {
      console.error("Redemption error:", err);
      alert('Erro ao realizar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRedemptionStatus = async (red: Redemption, newStatus: 'APPROVED' | 'REJECTED' | 'DELIVERED') => {
    try {
      if (newStatus === 'REJECTED') {
        // Refund points if rejected
        await runTransaction(db, async (transaction) => {
          const redRef = doc(db, 'redemptions', red.id!);
          const userRef = doc(db, 'users', red.clientId);
          
          transaction.update(redRef, { 
            status: 'REJECTED',
            updatedAt: serverTimestamp() 
          });
          transaction.update(userRef, { 
            points: increment(red.pointCost) 
          });
        });
        alert('Resgate rejeitado e pontos devolvidos.');
      } else if (newStatus === 'APPROVED') {
        // Approve: Debit stock
        await runTransaction(db, async (transaction) => {
          const redRef = doc(db, 'redemptions', red.id!);
          const prizeRef = doc(db, 'prizes', red.prizeId);
          
          const prizeSnap = await transaction.get(prizeRef);
          if (!prizeSnap.exists()) throw new Error("Prêmio não encontrado");
          if ((prizeSnap.data().stock || 0) <= 0) throw new Error("Estoque esgotado");

          transaction.update(redRef, { 
            status: 'APPROVED',
            updatedAt: serverTimestamp() 
          });
          transaction.update(prizeRef, { 
            stock: increment(-1) 
          });
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
      } else {
        await updateDoc(doc(db, 'redemptions', red.id!), { 
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      }
      
      if (isAdmin) fetchAllRedemptions();
      else fetchMyRedemptions();
      fetchPrizes();
    } catch (err: any) {
      console.error("Error updating redemption:", err);
      alert(err.message || "Erro ao atualizar status.");
    }
  };

  const filteredPrizes = prizes.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <Trophy className="text-amber-500" />
            Catálogo de Prêmios
          </h1>
          <p className="text-gray-500 mt-1">Troque seus pontos por brindes e serviços exclusivos.</p>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-6 py-3 bg-black hover:bg-gray-900 text-white font-bold rounded-xl shadow-xl transition-all"
          >
            <Plus size={20} />
            <span>Cadastrar Prêmio</span>
          </button>
        )}
      </div>

      {!isAdmin && (
        <section className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-amber-500">
             <Trophy size={120} />
          </div>
          <div className="relative z-10 text-center md:text-left">
            <p className="text-amber-800 text-xs font-black uppercase tracking-widest mb-1">Seu Saldo Atual</p>
            <div className="flex items-center gap-3 justify-center md:justify-start">
               <Coins className="text-amber-500" size={32} />
               <p className="text-5xl font-mono font-bold text-amber-900 leading-none">{user.points || 0}</p>
            </div>
          </div>
          <div className="relative z-10 w-full md:w-auto">
             <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-900 font-medium leading-tight">
                  Continue acumulando pontos em todos os seus serviços na Rota 430. 
                  Cada R$ gastado vale pontos para trocar por brindes!
                </p>
             </div>
          </div>
        </section>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar prêmios..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredPrizes.map((prize) => (
          <motion.div 
            whileHover={{ y: -4 }}
            key={prize.id} 
            className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col group transition-all"
          >
            <div className="aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden">
               {prize.imageUrl ? (
                 <img src={prize.imageUrl} alt={prize.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
               ) : (
                 <Gift size={48} className="text-gray-200" />
               )}
               <div className="absolute top-4 right-4 bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-lg">
                  <Coins size={16} />
                  {prize.pointCost}
               </div>
               {prize.stock <= 0 && (
                 <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center">
                    <span className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-red-200">
                      Esgotado
                    </span>
                 </div>
               )}
            </div>
            <div className="p-6 flex flex-col flex-1">
              <h3 className="font-display font-bold text-lg text-gray-900 group-hover:text-amber-600 transition-colors uppercase tracking-tight line-clamp-1">{prize.name}</h3>
              <p className="text-gray-500 text-sm mt-2 line-clamp-2 flex-1 leading-relaxed">{prize.description}</p>
              
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                   <Package size={14} className="text-gray-300" />
                   <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{prize.stock} disponíveis</span>
                </div>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(prize)} className="p-2 text-gray-400 hover:text-black transition-colors"><Edit2 size={18} /></button>
                    <button onClick={() => handleDelete(prize.id!)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                      setSelectedPrize(prize);
                      setShowConfirmModal(true);
                    }}
                    disabled={user.points < prize.pointCost || prize.stock <= 0}
                    className="px-6 py-2.5 bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg hover:shadow-black/20 disabled:opacity-30 disabled:shadow-none transition-all"
                  >
                    Resgatar
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {redemptions.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <History size={20} className="text-gray-400" />
              {isAdmin ? 'Solicitações de Resgate' : 'Meus Últimos Resgates'}
            </h2>
          </div>
          <div className="space-y-4">
            {redemptions.map((red) => (
              <div key={red.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    red.status === 'DELIVERED' ? 'bg-green-50 text-green-600' : 
                    red.status === 'APPROVED' ? 'bg-blue-50 text-blue-600' :
                    red.status === 'REJECTED' ? 'bg-red-50 text-red-600' :
                    'bg-amber-50 text-amber-600'
                  }`}>
                    {red.status === 'DELIVERED' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 uppercase tracking-tight">
                       {red.prizeName || prizes.find(p => p.id === red.prizeId)?.name || 'Resgate de Pontos'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(red.createdAt?.toDate?.() || red.createdAt).toLocaleString('pt-BR')} 
                      {isAdmin && ` • Cliente: ${red.clientName || red.clientId}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                   <div className="text-right flex flex-col items-end">
                      <span className="text-sm font-bold text-gray-900">-{red.pointCost} pts</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                        red.status === 'DELIVERED' ? 'text-green-600' : 
                        red.status === 'APPROVED' ? 'text-blue-600' :
                        red.status === 'REJECTED' ? 'text-red-600' :
                        'text-amber-600'
                      }`}>
                        {red.status === 'DELIVERED' ? 'Entregue' : 
                         red.status === 'APPROVED' ? 'Aprovado (Retirar)' :
                         red.status === 'REJECTED' ? 'Rejeitado' :
                         'Pendente'}
                      </span>
                   </div>
                   {isAdmin && red.status === 'PENDING' && (
                     <div className="flex gap-2">
                       <button 
                         onClick={() => handleUpdateRedemptionStatus(red, 'APPROVED')}
                         className="px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-all"
                       >
                          Aprovar
                       </button>
                       <button 
                         onClick={() => handleUpdateRedemptionStatus(red, 'REJECTED')}
                         className="px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-all"
                       >
                          Rejeitar
                       </button>
                     </div>
                   )}
                   {isAdmin && red.status === 'APPROVED' && (
                     <button 
                       onClick={() => handleUpdateRedemptionStatus(red, 'DELIVERED')}
                       className="p-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-all"
                     >
                        Entregar Brinde
                     </button>
                   )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin Prize Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden p-8 border border-white/20">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-display font-bold text-gray-900">{editingPrize ? 'Editar Prêmio' : 'Novo Prêmio'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-black"><X size={24} /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                   <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Nome do Brinde</label>
                   <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" />
                </div>
                <div>
                   <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Descrição Curta</label>
                   <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Custo em Pontos</label>
                    <input required type="number" value={pointCost} onChange={(e) => setPointCost(Number(e.target.value))} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-mono font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Estoque Inicial</label>
                    <input required type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-mono font-bold" />
                  </div>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                   <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Imagem do Brinde</label>
                   
                   <div className="flex flex-col gap-4">
                     {imageUrl && (
                       <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-white">
                         <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
                         <button 
                           type="button"
                           onClick={() => setImageUrl('')}
                           className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg backdrop-blur-sm hover:bg-black/70 transition-all"
                         >
                           <X size={14} />
                         </button>
                       </div>
                     )}
                     
                     {!imageUrl ? (
                       <label className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-all">
                         <Upload className="text-gray-400" />
                         <span className="text-sm font-bold text-gray-500">Clique para selecionar foto</span>
                         <span className="text-[10px] text-gray-400 font-medium">PNG ou JPG (Máx. 800KB)</span>
                         <input 
                           type="file" 
                           accept="image/*" 
                           onChange={handleImageUpload}
                           className="hidden"
                         />
                       </label>
                     ) : (
                       <div className="flex flex-col gap-2">
                         <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Ou use uma URL direta:</label>
                         <input 
                           type="text" 
                           value={imageUrl.startsWith('data:') ? 'Arquivo anexado' : imageUrl} 
                           onChange={(e) => setImageUrl(e.target.value)} 
                           className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 text-xs" 
                           placeholder="https://exemplo.com/imagem.png" 
                           readOnly={imageUrl.startsWith('data:')}
                         />
                         {imageUrl.startsWith('data:') && (
                           <button 
                             type="button" 
                             onClick={() => setImageUrl('')}
                             className="text-[10px] font-bold text-amber-600 hover:underline text-left"
                           >
                             Limpar anexo para usar URL
                           </button>
                         )}
                       </div>
                     )}
                   </div>
                </div>

                <div className="pt-4 flex gap-4">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-gray-500 hover:text-black">Cancelar</button>
                   <button type="submit" disabled={loading} className="flex-[2] py-4 bg-black text-white font-black uppercase tracking-widest rounded-xl hover:bg-gray-900 transition-all flex items-center justify-center shadow-lg shadow-black/10">
                      {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Salvar Prêmio'}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Redemption Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedPrize && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfirmModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-10 border border-white/20 text-center">
              <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Gift size={40} />
              </div>
              
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Confirmar Resgate?</h2>
              <p className="text-gray-500 text-sm mb-8">Você está prestes a trocar seus pontos pelo brinde: <br/><span className="text-black font-bold">"{selectedPrize.name}"</span></p>

              <div className="bg-gray-50 rounded-2xl p-6 mb-8 space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Saldo Atual</span>
                  <span className="font-mono font-bold text-gray-900">{user.points} pts</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Custo do Brinde</span>
                  <span className="font-mono font-bold text-rose-500">-{selectedPrize.pointCost} pts</span>
                </div>
                <div className="pt-4 border-t border-gray-200 flex justify-between items-center text-lg">
                  <span className="font-bold text-gray-900">Novo Saldo</span>
                  <span className="font-mono font-bold text-emerald-600">{(user.points - selectedPrize.pointCost)} pts</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleRedeem}
                  disabled={loading}
                  className="w-full py-4 bg-black text-white font-black uppercase tracking-widest rounded-xl hover:bg-gray-900 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Sim, quero resgatar!'}
                </button>
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full py-4 text-gray-400 font-bold hover:text-black transition-all"
                >
                  Talvez mais tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
