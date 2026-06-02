import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy, where, writeBatch } from 'firebase/firestore';
import { UserProfile, UserRole, Vehicle, ServiceItem, OSStatus, OperationType } from '../types';
import { Users, Plus, Search, Edit2, Trash2, Phone, Mail, User as UserIcon, Car, Wrench, ChevronRight, X, MapPin, Hash, Clipboard, Bike } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CAR_BRANDS, MOTO_BRANDS } from '../constants';
import { auth } from '../lib/firebase';
import { syncCpfLookup, createWorkOrder, sendPushNotification } from '../services/dataService';

export default function Clients() {
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const handleFirestoreError = (error: any, operationType: OperationType, path: string) => {
    const errInfo = {
      error: error?.message || String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);
  
  // OS & Vehicle Modals
  const [isOSModalOpen, setIsOSModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [clientVehicles, setClientVehicles] = useState<Vehicle[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceItem[]>([]);

  // OS Form
  const [osVehicleId, setOsVehicleId] = useState('');
  const [osSelectedServices, setOsSelectedServices] = useState<string[]>([]);
  const [osNotes, setOsNotes] = useState('');

  // Form states for Client
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [cep, setCep] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // Vehicles in form
  const [formVehicles, setFormVehicles] = useState<Partial<Vehicle>[]>([]);

  const handleCepChange = async (value: string) => {
    const cleanedCep = value.replace(/\D/g, '');
    setCep(value);

    if (cleanedCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setCity(data.localidade);
          if (data.logradouro) {
            setAddress(`${data.logradouro}, ${data.bairro}`);
          }
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      }
    }
  };

  useEffect(() => {
    fetchClients();
    fetchServices();
  }, []);

  const fetchClients = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.role === UserRole.CLIENT);
      setClients(data);
    } catch (error) {
      console.error("Error fetching clients:", error);
      handleFirestoreError(error, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    const q = query(collection(db, 'catalog'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    setServiceCatalog(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ServiceItem)));
  };

  const fetchClientVehicles = async (clientId: string) => {
    const q = query(collection(db, 'vehicles'), where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    setClientVehicles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
  };

  const handleOpenOSModal = async (client: UserProfile) => {
    setSelectedClient(client);
    await fetchClientVehicles(client.uid);
    setIsOSModalOpen(true);
    setOsVehicleId('');
    setOsSelectedServices([]);
    setOsNotes('');
  };

  const handleOpenVehicleModal = (client: UserProfile) => {
    setSelectedClient(client);
    setIsVehicleModalOpen(true);
    // This is for standalone vehicle addition
    setFormVehicles([{ type: 'CAR', licensePlate: '', brand: '', model: '', year: new Date().getFullYear(), color: '', engine: '', notes: '' }]);
  };

  const handleSaveOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osVehicleId || osSelectedServices.length === 0) return alert('Selecione um veículo e ao menos um serviço.');
    
    setLoading(true);
    try {
      let totalValue = 0;
      let totalPoints = 0;
      osSelectedServices.forEach(sName => {
        const s = serviceCatalog.find(item => item.name === sName);
        if (s) {
          totalValue += s.price;
          totalPoints += s.rewardPoints;
        }
      });

      if (!selectedClient?.uid) return;

      const result = await createWorkOrder(selectedClient.uid, osVehicleId, {
        services: osSelectedServices,
        totalValue,
        totalPoints,
        notes: osNotes
      });

      // Notify Client (Push)
      try {
        const vInfo = clientVehicles.find(v => v.id === osVehicleId);
        await sendPushNotification(
          [selectedClient.uid],
          "🛠️ Ordem de Serviço Aberta",
          `Uma nova Ordem de Serviço foi aberta para o seu veículo ${vInfo?.brand || ''} ${vInfo?.model || ''} (${vInfo?.licensePlate || ''}). ID: ${result.seqId}`,
          { osId: result.id }
        );
      } catch (notifyClientErr) {
        console.warn("Failed to notify client:", notifyClientErr);
      }

      // Notify staff (Mechanics and Admins)
      try {
        const staffSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', [UserRole.ADMIN, UserRole.MECHANIC])));
        const staffIds = staffSnap.docs.map(d => d.id);
        const vInfo = clientVehicles.find(v => v.id === osVehicleId);

        await sendPushNotification(
          staffIds,
          "🆕 Nova Ordem de Serviço",
          `Um novo serviço foi aberto para o veículo ${vInfo?.licensePlate || ''}. ID: ${result.seqId}`,
          { osId: result.id }
        );
      } catch (staffNotifyErr) {
        console.warn("Failed to notify staff:", staffNotifyErr);
      }

      setIsOSModalOpen(false);
      alert('Ordem de Serviço aberta com sucesso!');
    } catch (error) {
      console.error("Error saving OS:", error);
      alert('Erro ao abrir Ordem de Serviço.');
    } finally {
      setLoading(false);
    }
  };

  const addFormVehicle = () => {
    setFormVehicles([...formVehicles, { type: 'CAR', licensePlate: '', brand: '', model: '', year: new Date().getFullYear(), color: '', engine: '', notes: '' }]);
  };

  const removeFormVehicle = (index: number) => {
    setFormVehicles(formVehicles.filter((_, i) => i !== index));
  };

  const updateFormVehicle = (index: number, data: Partial<Vehicle>) => {
    const newVehicles = [...formVehicles];
    newVehicles[index] = { ...newVehicles[index], ...data };
    setFormVehicles(newVehicles);
  };

  const handleOpenModal = async (client?: UserProfile) => {
    if (client) {
      setEditingClient(client);
      setName(client.name);
      setEmail(client.email);
      setPhone(client.phone || '');
      setCpf(client.cpf || '');
      setAddress(client.address || '');
      setCity(client.city || '');
      setCep(client.cep || '');
      setBirthDate(client.birthDate || '');
      
      // Fetch vehicles for editing
      const q = query(collection(db, 'vehicles'), where('clientId', '==', client.uid));
      const snapshot = await getDocs(q);
      setFormVehicles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
    } else {
      setEditingClient(null);
      setName('');
      setEmail('');
      setPhone('');
      setCpf('');
      setAddress('');
      setCity('');
      setCep('');
      setBirthDate('');
      setFormVehicles([]); // Empty vehicles on new client
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let clientId = editingClient?.uid;

      if (editingClient) {
        try {
          await updateDoc(doc(db, 'users', editingClient.uid), {
            name,
            email,
            phone,
            cpf,
            address,
            city,
            cep,
            birthDate,
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${editingClient.uid}`);
        }
      } else {
        try {
          const clientRef = await addDoc(collection(db, 'users'), {
            name,
            email,
            phone,
            cpf,
            address,
            city,
            cep,
            birthDate,
            role: UserRole.CLIENT,
            points: 0,
            createdAt: serverTimestamp()
          });
          clientId = clientRef.id;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'users');
        }
      }

      // Save vehicles
      if (clientId) {
        // Sync CPF Lookup for easier finding during registration
        await syncCpfLookup(clientId, name, email, cpf);

        const batch = writeBatch(db);
        
        for (const v of formVehicles) {
          if (v.id) {
            // Update existing
            const vRef = doc(db, 'vehicles', v.id);
            batch.update(vRef, {
              ...v,
              licensePlate: v.licensePlate?.toUpperCase(),
              updatedAt: serverTimestamp()
            });
          } else {
            // Create new
            const vRef = doc(collection(db, 'vehicles'));
            batch.set(vRef, {
              ...v,
              clientId,
              licensePlate: v.licensePlate?.toUpperCase() || '',
              createdAt: serverTimestamp()
            });
          }
        }
        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'batch/vehicles');
        }
      }

      setIsModalOpen(false);
      fetchClients();
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Erro ao salvar cadastro. Verifique os dados.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cliente? Todos os veículos associados continuarão existindo, mas sem cliente.')) {
      try {
        await deleteDoc(doc(db, 'users', id));
        fetchClients();
      } catch (error) {
        console.error("Error deleting client:", error);
      }
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Gerenciamento de Clientes</h1>
          <p className="text-gray-500 mt-1">Base completa de clientes e frotas personalizadas.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-black hover:bg-gray-900 text-white font-bold rounded-xl shadow-xl transition-all"
        >
          <Plus size={20} />
          <span>Novo Cliente Completo</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por nome, e-mail ou telefone..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && clients.length === 0 ? (
          <div className="col-span-full py-12 flex justify-center">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredClients.length > 0 ? (
          filteredClients.map((client) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={client.uid} 
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 border border-gray-100">
                    <UserIcon size={24} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                      {client.points} pts
                    </span>
                  </div>
                </div>
                <h3 className="font-display font-bold text-lg text-gray-900 line-clamp-1">{client.name}</h3>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-col gap-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                       <Mail size={14} className="text-gray-400" />
                       <span className="truncate">{client.email}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-gray-400" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.cpf && (
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-gray-400" />
                        <span>{client.cpf}</span>
                      </div>
                    )}
                    {(client.city || client.address) && (
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-400" />
                        <span className="truncate">{[client.city, client.address].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOpenOSModal(client)}
                      className="flex-1 py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all border border-black shadow-sm"
                    >
                      <Plus size={14} />
                      Nova O.S.
                    </button>
                    <button 
                      onClick={() => handleOpenModal(client)}
                      className="flex-1 py-2.5 bg-white text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <Car size={14} />
                      Frotas
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-end gap-2">
                <button 
                  onClick={() => handleOpenModal(client)}
                  className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                  title="Editar cadastro completo"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(client.uid)}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Excluir cliente"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <Users size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 font-bold">Nenhum cliente encontrado.</p>
            <p className="text-gray-400 text-sm">Tente ajustar sua busca ou cadastrar um novo cliente.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden overflow-y-auto max-h-[95vh] border border-white/20">
              <div className="flex flex-col h-full">
                {/* Header modal */}
                <div className="p-8 bg-gray-50 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
                  <div>
                    <h2 className="text-3xl font-display font-bold text-gray-900 tracking-tight">
                      {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <p className="text-gray-500 text-sm">Preencha os dados pessoais e adicione os veículos do cliente.</p>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white text-gray-400 hover:text-black rounded-full border border-gray-200 shadow-sm transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-8">
                  <form onSubmit={handleSubmit} className="space-y-12">
                    {/* Seção Dados Pessoais */}
                    <section className="space-y-6">
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                        <div className="p-1.5 bg-black text-white rounded-lg">
                          <UserIcon size={16} />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Dados Pessoais</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="col-span-full md:col-span-2">
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">Nome Completo</label>
                          <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="Ex: João da Silva" />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">WhatsApp / Telefone</label>
                          <input required type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="(00) 00000-0000" />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">E-mail</label>
                          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="cliente@email.com" />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">CPF / CNPJ</label>
                          <input type="text" value={cpf} onChange={(e) => setCpf(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="000.000.000-00" />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">Data de Nascimento</label>
                          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="md:col-span-1 lg:col-span-2">
                          <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">Endereço Completo</label>
                          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="Rua, Número, Bairro" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">Cidade</label>
                            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="Cidade" />
                          </div>
                          <div>
                            <label className="block text-xs font-black uppercase tracking-tighter text-gray-500 mb-1.5">CEP</label>
                            <input type="text" value={cep} onChange={(e) => handleCepChange(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all placeholder:text-gray-300 font-medium" placeholder="00000-000" />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Seção Veículos */}
                    <section className="space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-500 text-white rounded-lg shadow-sm shadow-emerald-200">
                            <Car size={16} />
                          </div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Veículos da Frota ({formVehicles.length})</h3>
                        </div>
                        <button 
                          type="button" 
                          onClick={addFormVehicle}
                          className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-2"
                        >
                          <Plus size={14} />
                          Adicionar Novo
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        {formVehicles.map((v, idx) => (
                          <div key={idx} className="p-6 bg-gray-50/50 border border-gray-100 rounded-[1.5rem] relative group hover:border-gray-200 transition-all">
                            <button 
                              type="button" 
                              onClick={() => removeFormVehicle(idx)}
                              className="absolute -top-3 -right-3 p-2 bg-rose-50 text-rose-500 border border-rose-100 rounded-full hover:bg-rose-100 transition-all shadow-sm opacity-100 md:opacity-0 group-hover:opacity-100"
                            >
                              <X size={16} />
                            </button>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Tipo de Veículo</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button 
                                      type="button" 
                                      onClick={() => updateFormVehicle(idx, { type: 'CAR' })}
                                      className={`py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${v.type === 'CAR' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}
                                    >
                                      <Car size={14} />
                                      <span className="text-[10px] font-black uppercase">Carro</span>
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => updateFormVehicle(idx, { type: 'MOTORCYCLE' })}
                                      className={`py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${v.type === 'MOTORCYCLE' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}
                                    >
                                      <Bike size={14} />
                                      <span className="text-[10px] font-black uppercase">Moto</span>
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Placa</label>
                                  <input 
                                    required 
                                    type="text" 
                                    value={v.licensePlate} 
                                    onChange={(e) => updateFormVehicle(idx, { licensePlate: e.target.value })} 
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl uppercase font-black tracking-widest text-center focus:ring-2 focus:ring-black outline-none transition-all" 
                                    placeholder="AAA-0000" 
                                  />
                                </div>
                              </div>

                              <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Marca</label>
                                  <select 
                                    value={(v.brand && (v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(v.brand)) ? v.brand : (v.brand ? 'OTHER' : '')} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === 'OTHER') {
                                        updateFormVehicle(idx, { brand: ' ' }); // space to distinguish from empty but trigger custom view
                                      } else {
                                        updateFormVehicle(idx, { brand: val });
                                      }
                                    }} 
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all mb-2"
                                  >
                                    <option value="">Selecione...</option>
                                    {(v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).map(b => (
                                      <option key={b} value={b}>{b}</option>
                                    ))}
                                    <option value="OTHER">Outra (Personalizar na hora)</option>
                                  </select>
                                  
                                  {v.brand && !((v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(v.brand)) && (
                                    <input 
                                      required 
                                      type="text" 
                                      value={v.brand.trim()} 
                                      onChange={(e) => updateFormVehicle(idx, { brand: e.target.value })} 
                                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all mt-1" 
                                      placeholder="Digite a marca personalizada" 
                                      autoFocus
                                    />
                                  )}
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Modelo</label>
                                  <input required type="text" value={v.model} onChange={(e) => updateFormVehicle(idx, { model: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" placeholder="Ex: Corolla" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Ano</label>
                                  <input type="number" value={v.year} onChange={(e) => updateFormVehicle(idx, { year: Number(e.target.value) })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" placeholder="2023" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Cor</label>
                                  <input type="text" value={v.color} onChange={(e) => updateFormVehicle(idx, { color: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" placeholder="Branco" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Motor / Versão</label>
                                  <input type="text" value={v.engine} onChange={(e) => updateFormVehicle(idx, { engine: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" placeholder="1.8 VVT-i" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black uppercase tracking-tighter text-gray-400 mb-1.5">Observações</label>
                                  <input type="text" value={v.notes} onChange={(e) => updateFormVehicle(idx, { notes: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" placeholder="Blindado, etc." />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {formVehicles.length === 0 && (
                          <div className="py-12 border-2 border-dashed border-gray-100 rounded-[2rem] text-center bg-gray-50/50">
                            <Car size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nenhum veículo adicionado ainda.</p>
                            <button type="button" onClick={addFormVehicle} className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-600 hover:underline">
                              Clique para adicionar o primeiro veículo
                            </button>
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="pt-8 border-t border-gray-100 flex gap-4 sticky bottom-0 bg-white py-4 -mx-8 px-8 z-10 shadow-[0_-1px_0_rgba(0,0,0,0.05)] md:shadow-none">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 border border-gray-200 text-gray-700 font-bold rounded-2xl hover:bg-gray-50 transition-all">Cancelar</button>
                      <button type="submit" disabled={loading} className="flex-[2] py-4 bg-black text-white font-black uppercase tracking-widest rounded-2xl hover:bg-gray-900 transition-all flex items-center justify-center shadow-xl shadow-black/10">
                        {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingClient ? 'Salvar Alterações' : 'Concluir Cadastro'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isOSModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOSModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Abrir Ordem de Serviço</h2>
              <p className="text-gray-400 text-sm mb-8">Cliente: {selectedClient?.name}</p>
              
              <form onSubmit={handleSaveOS} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Selecione o Veículo</label>
                  <div className="grid grid-cols-1 gap-3">
                    {clientVehicles.map((v) => (
                      <button 
                        key={v.id}
                        type="button"
                        onClick={() => setOsVehicleId(v.id!)}
                        className={`p-4 border rounded-2xl flex items-center justify-between transition-all ${
                          osVehicleId === v.id ? 'border-black bg-black text-white' : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {v.type === 'MOTORCYCLE' ? <Bike size={18} /> : <Car size={18} />}
                          <div className="text-left">
                            <p className="font-bold uppercase leading-none tracking-widest">{v.licensePlate}</p>
                            <p className="text-[10px] uppercase opacity-70 mt-1">{v.brand} {v.model}</p>
                          </div>
                        </div>
                        {osVehicleId === v.id && <div className="w-2 h-2 bg-white rounded-full" />}
                      </button>
                    ))}
                    {clientVehicles.length === 0 && (
                      <div className="p-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-2xl italic">
                        Nenhum veículo cadastrado para este cliente.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Serviços do Catálogo</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {serviceCatalog.map((service) => (
                      <button 
                        key={service.id}
                        type="button"
                        onClick={() => {
                          if (osSelectedServices.includes(service.name)) {
                            setOsSelectedServices(osSelectedServices.filter(s => s !== service.name));
                          } else {
                            setOsSelectedServices([...osSelectedServices, service.name]);
                          }
                        }}
                        className={`p-3 text-xs font-bold rounded-xl border text-left flex items-center justify-between transition-colors ${
                          osSelectedServices.includes(service.name) ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-100'
                        }`}
                      >
                        <span>{service.name}</span>
                        {osSelectedServices.includes(service.name) && <X size={14} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Observações Técnicas</label>
                  <textarea 
                    value={osNotes}
                    onChange={(e) => setOsNotes(e.target.value)}
                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-black h-24 resize-none"
                    placeholder="Defeitos relatados, peças extras, etc..."
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setIsOSModalOpen(false)} className="flex-1 py-4 font-bold text-gray-500 hover:text-black">Cancelar</button>
                  <button type="submit" disabled={loading} className="flex-1 py-4 bg-black text-white font-bold rounded-2xl hover:bg-gray-900 disabled:opacity-50">
                    Abrir Ordem
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isVehicleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsVehicleModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 overflow-y-auto max-h-[90vh]">
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Acionar Veículo a Frota</h2>
                <p className="text-gray-400 text-sm mb-8">Cliente: {selectedClient?.name}</p>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setLoading(true);
                  try {
                    const batch = writeBatch(db);
                    for (const v of formVehicles) {
                      const vRef = doc(collection(db, 'vehicles'));
                      batch.set(vRef, {
                        ...v,
                        clientId: selectedClient?.uid,
                        licensePlate: v.licensePlate?.toUpperCase(),
                        createdAt: serverTimestamp()
                      });
                    }
                    await batch.commit();
                    setIsVehicleModalOpen(false);
                    alert('Frota atualizada com sucesso!');
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setLoading(false);
                  }
                }} className="space-y-6">
                  
                  {formVehicles.map((v, idx) => (
                    <div key={idx} className="p-5 bg-gray-50 border border-gray-100 rounded-2xl relative">
                      <button type="button" onClick={() => removeFormVehicle(idx)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500">
                        <X size={16} />
                      </button>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="col-span-2 md:col-span-1">
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Placa</label>
                          <input required type="text" value={v.licensePlate} onChange={(e) => updateFormVehicle(idx, { licensePlate: e.target.value })} className="w-full px-3 py-2 border rounded-xl uppercase font-bold" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Marca</label>
                          <select 
                            value={(v.brand && (v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(v.brand)) ? v.brand : (v.brand ? 'OTHER' : '')} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'OTHER') {
                                updateFormVehicle(idx, { brand: ' ' });
                              } else {
                                updateFormVehicle(idx, { brand: val });
                              }
                            }} 
                            className="w-full px-3 py-2 border rounded-xl"
                          >
                            <option value="">Selecione...</option>
                            {(v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                            <option value="OTHER">Outra...</option>
                          </select>
                          {v.brand && !((v.type === 'CAR' ? CAR_BRANDS : MOTO_BRANDS).includes(v.brand)) && (
                            <input 
                              required 
                              type="text" 
                              value={v.brand.trim()} 
                              onChange={(e) => updateFormVehicle(idx, { brand: e.target.value })} 
                              className="w-full px-3 py-2 border rounded-xl mt-1" 
                              placeholder="Marca" 
                              autoFocus
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Modelo</label>
                          <input required type="text" value={v.model} onChange={(e) => updateFormVehicle(idx, { model: e.target.value })} className="w-full px-3 py-2 border rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ano</label>
                          <input type="number" value={v.year} onChange={(e) => updateFormVehicle(idx, { year: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-xl" />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addFormVehicle} className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-2xl hover:border-black hover:text-black transition-all">
                    + Adicionar outro veículo
                  </button>

                  <div className="pt-6 flex gap-4">
                    <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="flex-1 py-4 font-bold text-gray-500 hover:text-black">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 py-4 bg-black text-white font-bold rounded-xl hover:bg-gray-900">
                      Salvar Tudo
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
