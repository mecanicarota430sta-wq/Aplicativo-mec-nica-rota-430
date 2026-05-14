import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { 
  doc, 
  setDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  collection, 
  writeBatch, 
  getDoc,
  limit
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '../types';
import { getUserProfile, syncCpfLookup } from '../services/dataService';
import { motion } from 'motion/react';
import { LogIn, Key, Mail, AlertCircle, Wrench, User as UserIcon } from 'lucide-react';
import { Logo } from '../components/Logo';

export default function Login({ config }: { config?: any }) {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationStep, setRegistrationStep] = useState<'CPF' | 'EMAIL' | 'PASSWORD'>('CPF');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundProfile, setFoundProfile] = useState<{ id: string; email: string; name: string } | null>(null);
  const [manualEmailEntry, setManualEmailEntry] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) return setError('Informe seu e-mail para receber o link de redefinição.');
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err: any) {
      console.error("Erro ao enviar reset:", err);
      setError('Erro ao enviar e-mail de redefinição. Verifique o endereço.');
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = async () => {
    if (registrationStep === 'CPF') {
      if (!cpf.trim()) return setError('Informe seu CPF ou CNPJ');
      setLoading(true);
      setError('');
      try {
        const rawValue = cpf.trim();
        const normalizedCpf = rawValue.replace(/\D/g, "");
        
        // 1. Try public lookup collection first (client-side)
        const lookupDoc = await getDoc(doc(db, 'cpf_lookup', normalizedCpf));
        
        if (lookupDoc.exists()) {
          const data = lookupDoc.data();
          setFoundProfile({ id: data.uid, email: data.email, name: data.name });
          setEmail(data.email || '');
          setName(data.name || '');
          setManualEmailEntry(false);
          setRegistrationStep('EMAIL');
        } else {
          // 2. Fallback: Try server-side API (it has admin privileges)
          try {
            const res = await fetch('/api/check-cpf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cpf: rawValue })
            });
            const serverData = await res.json();
            if (serverData.exists) {
              setFoundProfile({ id: serverData.id, email: serverData.email, name: serverData.name });
              setEmail(serverData.email || '');
              setName(serverData.name || '');
              setManualEmailEntry(false);
              setRegistrationStep('EMAIL');
              // Sync it now for next time
              await syncCpfLookup(serverData.id, serverData.name, serverData.email, rawValue);
              return;
            }
          } catch (apiErr) {
            console.error("Server CPF check fallback failed:", apiErr);
          }

          setFoundProfile(null);
          setEmail('');
          setName('');
          setManualEmailEntry(true);
          setRegistrationStep('EMAIL');
        }
      } catch (err) {
        console.error("CPF lookup error:", err);
        setError('Erro ao buscar CPF. Tente novamente.');
      } finally {
        setLoading(false);
      }
    } else if (registrationStep === 'EMAIL') {
      if (!email.trim() || !name.trim() || !phone.trim()) return setError('Preencha nome, e-mail e whatsapp');
      if (phone.replace(/\D/g, '').length < 10) return setError('WhatsApp deve conter DDD e número');
      setRegistrationStep('PASSWORD');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering && registrationStep !== 'PASSWORD') {
      return handleNextStep();
    }
    
    setError('');
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (isRegistering) {
        // ... previous registration logic is large, keeps it consistent ...
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const authUid = userCredential.user.uid;
        let existingProfile: any = null;
        let oldDocId: string | null = foundProfile?.id || null;
        if (oldDocId) {
          try {
             const snap = await getDoc(doc(db, 'users', oldDocId));
             if (snap.exists()) existingProfile = snap.data();
          } catch (err) { console.log("Lookup fallback fail", err); }
        }

        if (existingProfile && oldDocId) {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', authUid), {
            ...existingProfile,
            uid: authUid,
            name: name || existingProfile.name,
            email: normalizedEmail,
            phone: phone || existingProfile.phone || '',
            cpf: cpf.trim() || existingProfile.cpf || '',
            role: UserRole.CLIENT,
            updatedAt: serverTimestamp()
          });
          if (oldDocId !== authUid) batch.delete(doc(db, 'users', oldDocId));
          const vSnap = await getDocs(query(collection(db, 'vehicles'), where('clientId', '==', oldDocId)));
          vSnap.forEach(d => batch.update(doc(db, 'vehicles', d.id), { clientId: authUid }));
          const osSnap = await getDocs(query(collection(db, 'workOrders'), where('clientId', '==', oldDocId)));
          osSnap.forEach(d => batch.update(doc(db, 'workOrders', d.id), { clientId: authUid }));
          await batch.commit();
          await syncCpfLookup(authUid, name || existingProfile.name, normalizedEmail, cpf.trim() || existingProfile.cpf);
        } else {
          const role = normalizedEmail === 'mecanicarota430sta@gmail.com' ? UserRole.ADMIN : UserRole.CLIENT;
          await setDoc(doc(db, 'users', authUid), {
            uid: authUid,
            name: name || 'Usuário Rota 430',
            email: normalizedEmail,
            phone: phone || '',
            cpf: cpf.trim() || '',
            role: role,
            points: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          await syncCpfLookup(authUid, name || 'Usuário Rota 430', normalizedEmail, cpf.trim());
        }
      } else {
        // LOGIN MODE
        const loginEmail = email.trim().toLowerCase();
        const { user } = await signInWithEmailAndPassword(auth, loginEmail, password);
        
        // Background sync for admin
        if (user.email?.toLowerCase() === 'mecanicarota430sta@gmail.com') {
          try {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              name: 'Administrador Rota 430',
              email: user.email.toLowerCase(),
              role: UserRole.ADMIN,
              points: 0,
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (syncErr) {
            console.error("Admin profile sync failed (swallowed):", syncErr);
          }
        }
      }
      navigate('/');
    } catch (err: any) {
      console.error("Erro detalhado de Login:", err);
      let message = 'Erro ao autenticar. Verifique conexão e dados.';
      
      const emailToCheck = email.trim().toLowerCase();
      const isAdminEmail = emailToCheck === 'mecanicarota430sta@gmail.com';

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials' || err.code === 'auth/wrong-password') {
        if (isAdminEmail) {
          message = 'Senha ou e-mail do administrador incorretos. Verifique se o e-mail está correto e digite a senha com atenção.';
        } else {
          message = 'E-mail ou senha incorretos. Verifique os dados ou crie uma conta.';
        }
      } else if (err.code === 'auth/invalid-email') {
        message = 'Formato de e-mail inválido.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Muitas tentativas bloqueadas temporariamente. Tente mais tarde.';
      } else if (err.message?.includes('permissions') || err.message?.includes('permission-denied')) {
        message = 'Acesso negado. Perfil não encontrado ou sem permissão de acesso.';
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-gray-100"
      >
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-6">
              <Logo className="w-32 h-32 md:w-40 md:h-40" src={config?.logoUrl} />
              {config?.logoUrl && (
                <div className="absolute -bottom-2 -right-2 bg-black text-white p-2 rounded-xl shadow-lg border-2 border-white">
                  <Wrench size={16} />
                </div>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-gray-900 text-center tracking-tighter">
              {config?.shopName || 'Mecânica Rota 430'}
            </h1>
            <p className="text-gray-500 text-sm mt-2 font-medium">Especialista em Performance e Manutenção</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isRegistering ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                      placeholder="exemplo@gmail.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="flex justify-end mt-1">
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[10px] text-gray-500 hover:text-black font-semibold"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {registrationStep === 'CPF' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ do Cliente</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        required
                        value={cpf}
                        onChange={(e) => setCpf(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </motion.div>
                )}

                {registrationStep === 'EMAIL' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    {foundProfile ? (
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 mb-2">
                        Perfil encontrado! Verifique se os dados abaixo estão corretos.
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 mb-2">
                        Novo cliente? Preencha seus dados para continuar.
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                          placeholder="Seu nome"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Acesso</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                          placeholder="exemplo@gmail.com"
                        />
                      </div>
                      {foundProfile && !manualEmailEntry && (
                         <button 
                           type="button"
                           onClick={() => setManualEmailEntry(true)}
                           className="text-[10px] text-black underline mt-1 font-bold"
                         >
                           Não é este o e-mail? Alterar
                         </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp (com DDD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">BR</span>
                        <input
                          type="text"
                          required
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 11) setPhone(val);
                          }}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 italic leading-tight">
                        * Obrigatório para receber avisos de manutenção e pontos.
                      </p>
                    </div>
                  </motion.div>
                )}

                {registrationStep === 'PASSWORD' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 mb-2">
                      Para finalizar, crie uma senha única e exclusiva para acessar seu painel.
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Escolha uma Senha</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-100">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {resetSent && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-sm border border-green-100">
                <AlertCircle size={16} />
                <span>E-mail de redefinição enviado! Verifique sua caixa de entrada.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-black hover:bg-gray-900 text-white font-bold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {isRegistering ? (
                    registrationStep === 'PASSWORD' ? (
                      <>
                        <Key size={20} />
                        <span>Finalizar Cadastro</span>
                      </>
                    ) : (
                      <span>Continuar</span>
                    )
                  ) : (
                    <>
                      <LogIn size={20} />
                      <span>Acessar Painel</span>
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <button
              onClick={() => {
                const newMode = !isRegistering;
                setIsRegistering(newMode);
                setRegistrationStep('CPF');
                setError('');
                setEmail('');
                setName('');
                setPassword('');
                setCpf('');
                setFoundProfile(null);
              }}
              className="text-black font-semibold hover:underline text-sm"
            >
              {isRegistering ? 'Já tem uma conta? Faça login' : 'Novo por aqui? Crie seu perfil de cliente'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
