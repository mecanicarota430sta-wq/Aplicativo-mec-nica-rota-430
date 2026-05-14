import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, getDocs, addDoc, orderBy, deleteDoc, where } from 'firebase/firestore';
import { SystemConfig, Announcement } from '../types';
import { Settings, Save, Smartphone, MapPin, Award, Bell, Image as ImageIcon, Trash2, Plus as PlusIcon, History, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { bulkSyncCpfLookup } from '../services/dataService';

import { requestNotificationPermission } from '../services/notificationService';

export default function Config({ onSaveSuccess }: { onSaveSuccess?: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  
  // Announcement Form
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [now, setNow] = useState(new Date());
  const [backfilling, setBackfilling] = useState(false);

  const [config, setConfig] = useState<SystemConfig>({
    logoUrl: '',
    shopName: 'Mecânica Rota 430',
    phone: '',
    whatsappTemplate: 'Olá {{name}}, faz 6 meses que você realizou a {{service}} na Rota 430. Que tal passar aqui para uma revisão gratuita?',
    oilChangeIntervalMonths: 6
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchAnnouncements();
  }, []);

  const fetchConfig = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'system', 'config'));
      if (docSnap.exists()) {
        setConfig(docSnap.data() as SystemConfig);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      if (loading) setLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setAnnouncements(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    } catch (error) {
      console.error("Error fetching announcements:", error);
    }
  };

  const backfillCpfLookup = async () => {
    if (!window.confirm("Isso irá sincronizar todos os CPFs de clientes existentes para facilitar o cadastro. Deseja continuar?")) return;
    setBackfilling(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'CLIENT'));
      const snap = await getDocs(q);
      
      const clientsToSync = snap.docs
        .map(d => ({ 
          uid: d.id, 
          name: d.data().name, 
          email: d.data().email, 
          cpf: d.data().cpf 
        }))
        .filter(c => c.cpf);

      if (clientsToSync.length === 0) {
        alert("Nenhum cliente com CPF encontrado para sincronizar.");
        return;
      }

      const count = await bulkSyncCpfLookup(clientsToSync);
      alert(`✅ Sincronização concluída! ${count} registros processados.`);
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      alert("Erro na sincronização: " + (err.message || "Erro desconhecido"));
    } finally {
      setBackfilling(false);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 512;
          const MAX_HEIGHT = 512;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Use low quality to ensure it fits in Firestore (0.7 quality)
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'announcements'), {
        title: annTitle,
        content: annContent,
        type: 'PUBLIC',
        createdAt: serverTimestamp(),
        authorId: 'admin'
      });
      setAnnTitle('');
      setAnnContent('');
      setIsAnnouncementModalOpen(false);
      fetchAnnouncements();
    } catch (error) {
      console.error("Error saving announcement:", error);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      fetchAnnouncements();
    } catch (error) {
      console.error("Error deleting announcement:", error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Check logo size (Firestore limit is 1MB per document)
      if (config.logoUrl && config.logoUrl.length > 800000) {
        alert('A imagem da logo é muito grande mesmo após compressão. Tente uma imagem mais simples ou menor.');
        setSaving(false);
        return;
      }

      await setDoc(doc(db, 'system', 'config'), {
        ...config,
        updatedAt: serverTimestamp()
      });
      
      setSaveStatus('success');
      if (onSaveSuccess) onSaveSuccess();
      
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error: any) {
      console.error("Error saving config:", error);
      setSaveStatus('error');
      alert('Erro ao salvar configurações: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">Configurações do Sistema</h1>
          <p className="text-gray-500 mt-1">Personalize os dados da sua oficina e as réguas de comunicação.</p>
        </div>
        <button 
          onClick={() => navigate('/logs')}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-2xl transition-all"
        >
          <History size={20} />
          <span>Logs de Auditoria</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identidade Visual */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <ImageIcon size={24} />
            <h2>Identidade Visual</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Oficina</label>
              <input 
                required
                type="text" 
                value={config.shopName}
                onChange={(e) => setConfig({ ...config, shopName: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Logo da Oficina</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-xl overflow-hidden flex items-center justify-center p-2">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="Logo Preview" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="text-[10px] text-gray-300 font-bold uppercase">Sem Logo</div>
                  )}
                </div>
                <div className="flex-1">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressed = await compressImage(file);
                          setConfig({ ...config, logoUrl: compressed });
                        } catch (err) {
                          console.error("Error compressing image:", err);
                        }
                      }
                    }}
                    className="hidden" 
                    id="logo-upload"
                  />
                  <label 
                    htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-200 text-gray-500 font-bold text-sm rounded-xl hover:border-black hover:text-black transition-all cursor-pointer"
                  >
                    <PlusIcon size={16} />
                    <span>Carregar Imagem</span>
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-black">Recomendado: 512x512px</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PWA / Notifications Section */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <Bell size={24} />
            <h2>Aplicativo e Notificações Push</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-2 text-sm uppercase tracking-widest flex items-center gap-2">
                <Smartphone size={16} /> Instalar Sistema
              </h3>
              <p className="text-xs text-gray-500 mb-4">Acesse sua oficina como um aplicativo nativo no celular ou computador.</p>
              <div className="text-[10px] text-gray-400 space-y-1 bg-white p-3 rounded-lg border border-gray-200/50">
                <p>• <strong>iPhone:</strong> Compartilhar &gt; Adicionar à Tela de Início</p>
                <p>• <strong>Android/Chrome:</strong> Opções &gt; Instalar Aplicativo</p>
              </div>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-2 text-sm uppercase tracking-widest flex items-center gap-2">
                <Bell size={16} /> Alertas em Tempo Real
              </h3>
              <p className="text-xs text-gray-500 mb-4">Receba avisos imediatos de novas O.S. e mudanças de manutenção.</p>
              <button 
                type="button"
                disabled={notifLoading}
                onClick={async () => {
                  setNotifLoading(true);
                  const ok = await requestNotificationPermission();
                  setNotifLoading(false);
                  if (ok) alert("✅ Dispositivo cadastrado! Você receberá notificações a partir de agora.");
                }}
                className="w-full py-4 bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95"
              >
                {notifLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Bell size={14} />}
                {notifLoading ? 'Configurando...' : 'Ativar Notificações Neste Dispositivo'}
              </button>
            </div>
          </div>
        </section>

        {/* Comunicação & Fidelidade */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <Smartphone size={24} />
            <h2>Fidelidade & WhatsApp</h2>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Telefone da Oficina (WhatsApp)</label>
                <input 
                  type="text" 
                  value={config.phone || ''}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Intervalo de Troca de Óleo (Meses)</label>
                <input 
                  type="number" 
                  value={config.oilChangeIntervalMonths || 6}
                  onChange={(e) => setConfig({ ...config, oilChangeIntervalMonths: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Template de Mensagem WhatsApp (Manutenção)</label>
              <textarea 
                value={config.whatsappTemplate || ''}
                onChange={(e) => setConfig({ ...config, whatsappTemplate: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all resize-none"
                placeholder="Dica: Use {{name}} para o nome do cliente e {{service}} para o serviço."
              />
              <p className="text-xs text-gray-400 mt-2 italic">
                Tags: {"{{name}}"}, {"{{vehicle}}"}, {"{{plate}}"}, {"{{service}}"}, {"{{time}}"}, {"{{timing}}"}, {"{{months}}"}, {"{{km}}"}, {"{{shop}}"}
              </p>
              <div className="bg-gray-100 p-4 rounded-2xl mt-4 text-[10px] text-gray-500 font-medium leading-relaxed">
                 <p><strong>Dica Profissional:</strong> A tag <strong>{"{{time}}"}</strong> (ou <strong>{"{{timing}}"}</strong>) calcula automaticamente se deve dizer "6 meses", "1 ano" ou "1 ano e 3 meses". Use-a para uma mensagem mais natural.</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Template de Mensagem WhatsApp (Aniversário)</label>
              <textarea 
                value={config.whatsappBirthdayTemplate || ''}
                onChange={(e) => setConfig({ ...config, whatsappBirthdayTemplate: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all resize-none"
                placeholder="Dica: Use {{name}} para o nome do cliente."
              />
              <p className="text-xs text-gray-400 mt-2 italic">
                Tags disponíveis: {"{{name}}"}, {"{{shop}}"}
              </p>
            </div>
          </div>
        </section>

        {/* Ajuste de Data do Sistema */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <Settings size={24} />
            <h2>Simulação de Data (Sistema)</h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 italic">
              Use este campo para simular uma data no sistema. Isso afetará os cálculos de lembretes de manutenção e aniversários. Se deixado vazio, o sistema usará a data real.
            </p>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Simular Data e Hora Atual</label>
              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <input 
                    type="datetime-local" 
                    value={config.customSystemDate || ''}
                    onChange={(e) => setConfig({ ...config, customSystemDate: e.target.value })}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                  />
                  {config.customSystemDate && (
                    <button 
                      type="button"
                      onClick={() => setConfig({ ...config, customSystemDate: undefined })}
                      className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                    >
                      Resetar para Real
                    </button>
                  )}
                </div>
                <div className="p-4 bg-gray-900 rounded-2xl text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Data Atual do Sistema</p>
                      <p className="text-xl font-mono font-bold leading-tight">
                        {new Date(config.customSystemDate || now).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Status</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${config.customSystemDate ? 'bg-amber-500/20 text-amber-500' : 'bg-green-500/20 text-green-500'}`}>
                        {config.customSystemDate ? 'Simulada' : 'Real (Sincronizada)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Database Maintenance */}
        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <Settings size={24} />
            <h2>Manutenção da Base de Dados</h2>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 p-6 bg-amber-50 rounded-2xl border border-amber-100">
            <div className="flex-1">
              <h4 className="font-bold text-amber-900 flex items-center gap-2">
                <RefreshCcw size={18} /> Sincronizar CPFs dos Clientes
              </h4>
              <p className="text-xs text-amber-700 mt-1">
                Garante que todos os clientes cadastrados pela oficina possam ser encontrados pelo CPF na tela de registro do cliente.
              </p>
            </div>
            <button 
              type="button"
              disabled={backfilling}
              onClick={backfillCpfLookup}
              className="w-full md:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {backfilling ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <RefreshCcw size={16} />}
              <span>{backfilling ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
            </button>
          </div>
        </section>

        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
            <Bell size={24} />
            <h2>Mural de Avisos Públicos</h2>
          </div>
          
          <div className="space-y-4">
            {announcements.map((ann) => (
              <div key={ann.id} className="p-4 bg-gray-50 rounded-xl flex items-center justify-between group">
                <div>
                  <h4 className="font-bold text-gray-900">{ann.title}</h4>
                  <p className="text-sm text-gray-500">{ann.content.slice(0, 50)}...</p>
                </div>
                <button 
                  type="button"
                  onClick={() => handleDeleteAnnouncement(ann.id!)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          <button 
            type="button"
            onClick={() => setIsAnnouncementModalOpen(true)}
            className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-2xl hover:border-black hover:text-black transition-all flex items-center justify-center gap-2"
          >
            <PlusIcon size={20} />
            Novo Aviso Público
          </button>
        </section>

        <div className="flex items-center gap-4 justify-end">
          {saveStatus === 'success' && (
            <motion.p 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-emerald-600 font-bold text-sm"
            >
              Configurações salvas com sucesso!
            </motion.p>
          )}
          <button 
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-12 py-4 bg-black hover:bg-gray-900 text-white font-bold rounded-2xl shadow-2xl transition-all disabled:opacity-50"
          >
            {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={20} />}
            <span>{saving ? 'Salvando...' : 'Salvar Todas as Configurações'}</span>
          </button>
        </div>
      </form>

      <AnimatePresence>
        {isAnnouncementModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAnnouncementModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8">
              <h3 className="text-xl font-display font-bold text-gray-900 mb-6">Novo Aviso Público</h3>
              <form onSubmit={handleSaveAnnouncement} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Título</label>
                  <input required type="text" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Mensagem</label>
                  <textarea required value={annContent} onChange={(e) => setAnnContent(e.target.value)} rows={4} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all resize-none" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAnnouncementModalOpen(false)} className="flex-1 py-4 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50">Cancelar</button>
                  <button type="submit" className="flex-1 py-4 bg-black text-white font-bold rounded-xl hover:bg-gray-900">Publicar Agora</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Plus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
