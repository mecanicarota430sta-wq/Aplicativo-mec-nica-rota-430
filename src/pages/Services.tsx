import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ServiceItem } from '../types';
import { Package, Plus, Search, Edit2, Trash2, DollarSign, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Services() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [maintenanceIntervalMonths, setMaintenanceIntervalMonths] = useState<number>(0);
  const [maintenanceIntervalKm, setMaintenanceIntervalKm] = useState<number>(0);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const q = query(collection(db, 'catalog'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceItem));
      setServices(data);
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (service?: ServiceItem) => {
    if (service) {
      setEditingService(service);
      setName(service.name);
      setPrice(service.price);
      setRewardPoints(service.rewardPoints);
      setMaintenanceIntervalMonths(service.maintenanceIntervalMonths || 0);
      setMaintenanceIntervalKm(service.maintenanceIntervalKm || 0);
    } else {
      setEditingService(null);
      setName('');
      setPrice(0);
      setRewardPoints(0);
      setMaintenanceIntervalMonths(0);
      setMaintenanceIntervalKm(0);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const serviceData = {
        name,
        price: Number(price),
        rewardPoints: Number(rewardPoints),
        maintenanceIntervalMonths: Number(maintenanceIntervalMonths),
        maintenanceIntervalKm: Number(maintenanceIntervalKm),
        updatedAt: serverTimestamp()
      };

      if (editingService) {
        await updateDoc(doc(db, 'catalog', editingService.id!), serviceData);
      } else {
        await addDoc(collection(db, 'catalog'), {
          ...serviceData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      fetchServices();
    } catch (error) {
      console.error("Error saving service:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este serviço?')) {
      try {
        await deleteDoc(doc(db, 'catalog', id));
        fetchServices();
      } catch (error) {
        console.error("Error deleting service:", error);
      }
    }
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Catálogo de Serviços</h1>
          <p className="text-gray-500 mt-1">Defina os serviços e a pontuação para o programa de fidelidade.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-black hover:bg-gray-900 text-white font-bold rounded-xl shadow-xl transition-all"
        >
          <Plus size={20} />
          <span>Cadastrar Serviço</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por nome do serviço..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredServices.length > 0 ? (
          filteredServices.map((service) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={service.id} 
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-black">
                  <Package size={24} />
                </div>
                <div className="bg-yellow-100 text-yellow-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  +{service.rewardPoints} Pontos
                </div>
              </div>
              <h3 className="font-display font-bold text-lg text-gray-900 mb-4">{service.name}</h3>
              <div className="flex items-end justify-between mt-auto">
                <div>
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Preço Padrão</span>
                  <span className="text-xl font-mono font-bold text-black">R$ {service.price.toFixed(2)}</span>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(service)}
                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(service.id!)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-gray-500">
            Nenhum serviço encontrado.
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">
                  {editingService ? 'Editar Serviço' : 'Novo Serviço'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Serviço</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                      placeholder="Ex: Troca de Óleo"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Preço Sugerido (R$)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                          required
                          type="number" 
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(Number(e.target.value))}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Pontos de Reserva</label>
                      <div className="relative">
                        <Award className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                          required
                          type="number" 
                          value={rewardPoints}
                          onChange={(e) => setRewardPoints(Number(e.target.value))}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-2xl space-y-4 border border-gray-100">
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Plano de Manutenção</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">A cada (Meses)</label>
                        <input 
                          type="number" 
                          value={maintenanceIntervalMonths}
                          onChange={(e) => setMaintenanceIntervalMonths(Number(e.target.value))}
                          className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
                          placeholder="Ex: 6"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Deixe 0 para ignorar</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">A cada (Km)</label>
                        <input 
                          type="number" 
                          value={maintenanceIntervalKm}
                          onChange={(e) => setMaintenanceIntervalKm(Number(e.target.value))}
                          className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
                          placeholder="Ex: 10000"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Deixe 0 para ignorar</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-6 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-4 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-4 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-all flex items-center justify-center"
                    >
                      {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Salvar no Catálogo'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
