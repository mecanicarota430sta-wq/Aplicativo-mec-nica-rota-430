import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLog, UserProfile, UserRole } from '../types';
import { cleanOldLogs } from '../services/dataService';
import { motion } from 'motion/react';
import { 
  History, 
  Search, 
  Clock, 
  User as UserIcon, 
  Trash2, 
  ShieldCheck, 
  Layout, 
  FileText,
  AlertCircle
} from 'lucide-react';

export default function AuditLogs({ user }: { user: UserProfile }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchLogs() {
      // Trigger cleanup as well
      if (user.role === UserRole.ADMIN) {
        await cleanOldLogs();
      }

      try {
        const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(100));
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
      } catch (err) {
        console.error("Error fetching logs:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [user.role]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'DELETE_OS': return <Trash2 size={16} className="text-red-500" />;
      case 'CREATE_OS': return <FileText size={16} className="text-blue-500" />;
      case 'UPDATE_PROFILE': return <UserIcon size={16} className="text-amber-500" />;
      default: return <Clock size={16} className="text-gray-400" />;
    }
  };

  const filteredLogs = logs.filter(log => 
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-display font-black text-gray-900 tracking-tight flex items-center gap-4">
            <div className="p-3 bg-black text-white rounded-2xl shadow-xl">
              <History size={32} />
            </div>
            Audit Log
          </h1>
          <p className="text-gray-500 mt-2 font-medium">Histórico de ações (limite de 7 dias).</p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
          <input 
            type="text" 
            placeholder="Pesquisar logs..." 
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Data/Hora</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Usuário</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ação</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium">Carregando logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium">Nenhum registro encontrado.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={log.id} 
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-8 py-6 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-900">
                          {log.timestamp?.toDate?.().toLocaleDateString() || 'Recent'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {log.timestamp?.toDate?.().toLocaleTimeString() || 'Agora'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-lg ${log.userRole === UserRole.ADMIN ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>
                           {log.userRole === UserRole.ADMIN ? <ShieldCheck size={14} /> : <UserIcon size={14} />}
                         </div>
                         <span className="text-xs font-black uppercase tracking-tight text-gray-700">{log.userName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{log.action}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-medium text-gray-600 line-clamp-2 max-w-md">{log.details}</p>
                      {log.targetId && (
                         <p className="text-[10px] text-gray-400 font-mono mt-1">ID Alvo: {log.targetId}</p>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex items-start gap-4">
        <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm font-bold text-amber-900">Política de Retenção</p>
          <p className="text-xs text-amber-700 font-medium leading-relaxed mt-1">
            Para garantir a privacidade e o desempenho do sistema, logs de auditoria são mantidos por um período máximo de 7 dias, após o qual são permanentemente removidos.
          </p>
        </div>
      </div>
    </div>
  );
}
