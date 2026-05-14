import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Mail, 
  Phone, 
  Shield, 
  Wrench, 
  X, 
  Trash2, 
  Edit2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function Staff() {
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: UserRole.MECHANIC,
    phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      // Fetch both ADMIN and MECHANIC
      const q = query(
        collection(db, 'users'), 
        where('role', 'in', [UserRole.ADMIN, UserRole.MECHANIC])
      );
      const snap = await getDocs(q);
      setStaff(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    } catch (err) {
      console.error("Error fetching staff:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (member?: UserProfile) => {
    if (member) {
      setEditingStaff(member);
      setFormData({
        name: member.name,
        email: member.email,
        role: member.role as UserRole,
        phone: member.phone || ''
      });
    } else {
      setEditingStaff(null);
      setFormData({
        name: '',
        email: '',
        role: UserRole.MECHANIC,
        phone: ''
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (editingStaff) {
        await updateDoc(doc(db, 'users', editingStaff.uid), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        // Here we just add to users collection. 
        // Note: Real Firebase Auth would need separate creation, 
        // but for this flow we assume the user will sign in with this email.
        await addDoc(collection(db, 'users'), {
          ...formData,
          points: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      fetchStaff();
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar funcionário");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!window.confirm("Deseja realmente remover este funcionário?")) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      fetchStaff();
    } catch (err) {
      console.error("Error deleting staff:", err);
    }
  };

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Equipe</h1>
          <p className="text-gray-500 mt-1">Gerencie os administradores e mecânicos da oficina.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-8 py-4 bg-black text-white font-black uppercase tracking-widest rounded-2xl shadow-2xl hover:bg-gray-800 transition-all"
        >
          <UserPlus size={20} />
          <span>Novo Funcionário</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por nome ou e-mail..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
             <div key={i} className="h-48 bg-gray-200 animate-pulse rounded-3xl" />
          ))
        ) : filteredStaff.map((member) => (
          <motion.div 
            layout
            key={member.uid}
            className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl transition-all group relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-5 transition-transform group-hover:scale-150 ${member.role === UserRole.ADMIN ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
            
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg ${member.role === UserRole.ADMIN ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                  {member.role === UserRole.ADMIN ? <Shield size={24} /> : <Wrench size={24} />}
                </div>
                <div>
                  <h3 className="font-display font-bold text-gray-900 group-hover:text-black transition-colors uppercase tracking-tight">{member.name}</h3>
                  <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${member.role === UserRole.ADMIN ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {member.role === UserRole.ADMIN ? 'Administrador' : 'Mecânico'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3 relative z-10">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Mail size={16} />
                <span className="truncate">{member.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Phone size={16} />
                <span>{member.phone || 'Sem telefone'}</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-end gap-2 relative z-10">
              <button 
                onClick={() => handleOpenModal(member)}
                className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-xl transition-all"
              >
                <Edit2 size={18} />
              </button>
              <button 
                onClick={() => handleDelete(member.uid)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </motion.div>
        ))}
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
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8 border border-white/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
                    {editingStaff ? 'Editar Funcionário' : 'Novo Funcionário'}
                  </h2>
                  <p className="text-gray-400 text-sm font-medium mt-1">Prencha os dados de acesso.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-gray-50 text-gray-400 hover:text-black rounded-2xl transition-colors">
                  <X size={24} />
                </button>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Nome Completo</label>
                    <input 
                      required
                      type="text" 
                      className="w-full mt-1 px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none font-medium"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">E-mail</label>
                    <input 
                      required
                      type="email" 
                      className="w-full mt-1 px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none font-medium"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Telefone</label>
                    <input 
                      type="text" 
                      className="w-full mt-1 px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none font-medium"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Cargo / Permissão</label>
                    <select 
                      className="w-full mt-1 px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none font-bold"
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                    >
                      <option value={UserRole.MECHANIC}>Mecânico</option>
                      <option value={UserRole.ADMIN}>Administrador</option>
                    </select>
                  </div>
                </div>

                <button 
                  disabled={submitting}
                  className="w-full py-5 bg-black text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl hover:bg-gray-800 transition-all flex items-center justify-center gap-3 disabled:bg-gray-300"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Salvar Cadastro
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
