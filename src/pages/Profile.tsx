import React, { useState } from 'react';
import { UserProfile, OperationType } from '../types';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Phone, 
  Mail, 
  Lock, 
  Save, 
  AlertCircle,
  CheckCircle2,
  ChevronLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Profile({ user, onProfileUpdate }: { user: UserProfile, onProfileUpdate: (p: UserProfile) => void }) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  // Mask for Phone (XX) XXXXX-XXXX
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Usuário não autenticado.');

      // 1. Validations
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        throw new Error('O WhatsApp com DDD é obrigatório para avisos do sistema.');
      }

      // 2. Security updates if needed
      if (showPasswordFields || email !== user.email) {
        if (!currentPassword) {
          throw new Error('Digite sua senha atual para realizar alterações de segurança.');
        }

        const credential = EmailAuthProvider.credential(currentUser.email!, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        if (email !== user.email) {
          await updateEmail(currentUser, email);
        }

        if (showPasswordFields) {
          if (newPassword !== confirmPassword) {
            throw new Error('As novas senhas não coincidem.');
          }
          if (newPassword.length < 6) {
            throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
          }
          await updatePassword(currentUser, newPassword);
        }
      }

      // 3. Update Firestore Profile
      const userRef = doc(db, 'users', user.uid);
      const updatedData = {
        name,
        email: email.toLowerCase(),
        phone,
        updatedAt: serverTimestamp()
      };

      await updateDoc(userRef, updatedData);
      
      const updatedProfile = { ...user, ...updatedData };
      onProfileUpdate(updatedProfile);
      setSuccess('Perfil atualizado com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordFields(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      let msg = 'Erro ao atualizar perfil.';
      if (err.code === 'auth/wrong-password') msg = 'Senha atual incorreta.';
      else if (err.code === 'auth/requires-recent-login') msg = 'Por segurança, faça login novamente para mudar dados críticos.';
      else if (err.message) msg = err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <button 
        onClick={handleBack}
        className="flex items-center gap-2 text-gray-500 hover:text-black mb-8 transition-colors group"
      >
        <div className="p-2 bg-gray-100 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
          <ChevronLeft size={20} />
        </div>
        <span className="font-bold text-sm">Voltar</span>
      </button>

      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-100/50">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <User size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Meu Perfil</h1>
            <p className="text-gray-500 text-sm">Gerencie suas informações e segurança.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-rose-50 text-rose-600 rounded-2xl flex items-center gap-3 text-sm font-medium border border-rose-100"
              >
                <AlertCircle size={20} />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center gap-3 text-sm font-medium border border-emerald-100"
              >
                <CheckCircle2 size={20} />
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                <User size={14} /> Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl px-5 py-4 transition-all outline-none font-medium"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                <Phone size={14} /> WhatsApp (com DDD)
              </label>
              <input
                type="text"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="(00) 00000-0000"
                className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl px-5 py-4 transition-all outline-none font-medium"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
              <Mail size={14} /> E-mail de Acesso
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl px-5 py-4 transition-all outline-none font-medium"
                required
              />
              <p className="text-[10px] text-gray-400 mt-1 italic leading-tight">
                * Mudar o e-mail afetará seu próximo login.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-50">
            <button
              type="button"
              onClick={() => setShowPasswordFields(!showPasswordFields)}
              className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors"
            >
              <Lock size={16} />
              {showPasswordFields ? 'Cancelar alteração de senha' : 'Alterar minha senha'}
            </button>

            <AnimatePresence>
              {showPasswordFields && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Nova Senha</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-600 outline-none"
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Confirmar Senha</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-600 outline-none"
                        placeholder="Repita a nova senha"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {(showPasswordFields || email !== user.email) && (
            <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50 space-y-2">
              <label className="text-xs font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
                Confirmar Senha Atual
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Sua senha de login atual"
                className="w-full bg-white border-2 border-transparent focus:border-blue-600 rounded-2xl px-5 py-4 transition-all outline-none font-medium"
                required
              />
              <p className="text-[10px] text-blue-400 italic">
                * Necessário para validar alterações de segurança.
              </p>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg transition-all ${
                loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 active:scale-95'
              }`}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Save size={20} />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
