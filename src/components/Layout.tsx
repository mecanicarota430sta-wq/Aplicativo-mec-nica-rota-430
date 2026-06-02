import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Menu, X, LayoutDashboard, Users, Settings as SettingsIcon, Package, Wrench, Bell } from 'lucide-react';
import { collection, query, where, getDocs, writeBatch, doc as fireDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { calculateMaintenanceReminders, calculateBirthdayReminders, bulkSyncCpfLookup } from '../services/dataService';

interface LayoutProps {
  user: UserProfile | null;
  config?: any;
}

import { Logo } from './Logo';

export function Layout({ user, config }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [remindersCount, setRemindersCount] = useState(0);

  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    if (user?.role === UserRole.ADMIN || user?.role === UserRole.MECHANIC) {
      const fetchReminders = async () => {
        try {
          const maintenance = await calculateMaintenanceReminders();
          const birthdays = await calculateBirthdayReminders();
          setRemindersCount(maintenance.length + birthdays.length);
        } catch (error) {
          console.error("Error fetching reminders count:", error);
        }
      };

      const checkAndSyncCpf = async () => {
        if (isSyncingRef.current) return;
        const now = Date.now();
        if (now - lastSyncRef.current < 60000) return;

        try {
          isSyncingRef.current = true;
          const statusRef = fireDoc(db, 'system', 'status');
          const statusDoc = await getDoc(statusRef);
          
          let needsSync = true;
          if (statusDoc.exists()) {
            const lastServerSync = statusDoc.data().lastCpfSync?.toMillis() || 0;
            if (now - lastServerSync < 180000) { // Check every 3 minutes instead of 1 minute to be less aggressive
              needsSync = false;
              lastSyncRef.current = lastServerSync;
            }
          }

          if (needsSync) {
            console.log('[AutoSync] Background CPF sync started...');
            const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'CLIENT')));
            
            if (!usersSnap.empty) {
              const clientsToSync = usersSnap.docs
                .map(d => ({ 
                  uid: d.id, 
                  name: d.data().name, 
                  email: d.data().email, 
                  cpf: d.data().cpf 
                }))
                .filter(c => c.cpf);

              if (clientsToSync.length > 0) {
                await bulkSyncCpfLookup(clientsToSync);
              }
            }

            await setDoc(statusRef, { lastCpfSync: serverTimestamp() }, { merge: true });
            lastSyncRef.current = Date.now();
            console.log('[AutoSync] Background CPF sync completed.');
          }
        } catch (err) {
          console.error('[AutoSync] Background sync failed:', err);
        } finally {
          isSyncingRef.current = false;
        }
      };
      
      fetchReminders();
      checkAndSyncCpf();
      
      const reminderInterval = setInterval(fetchReminders, 1000 * 60 * 15); // 15 mins (less frequent)
      const syncInterval = setInterval(checkAndSyncCpf, 1000 * 60 * 5); // 5 mins (less frequent)

      return () => {
        clearInterval(reminderInterval);
        clearInterval(syncInterval);
      };
    }
  }, [user?.uid, user?.role]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const isAdmin = user?.role === UserRole.ADMIN;
  const isMechanic = user?.role === UserRole.MECHANIC;
  const isStaff = isAdmin || isMechanic;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { id: 'clients', label: 'Clientes', icon: <Users size={20} />, path: '/clientes' },
    { id: 'equipe', label: 'Equipe', icon: <Users size={20} />, path: '/equipe', adminOnly: true },
    { id: 'servicos', label: 'Serviços', icon: <Package size={20} />, path: '/servicos' },
    { id: 'os', label: 'Ordens de Serviço', icon: <Wrench size={20} />, path: '/os' },
    { id: 'reminders', label: 'Lembretes', icon: <Bell size={20} />, path: '/lembretes', showBadge: true },
    { id: 'prizes', label: 'Prêmios', icon: <Package size={20} />, path: '/premios' },
    { id: 'config', label: 'Configuração', icon: <SettingsIcon size={20} />, path: '/config' },
  ].filter(item => !item.adminOnly || isAdmin);

  if (user?.role === UserRole.CLIENT) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" src={config?.logoUrl} />
              <span className="font-display font-bold text-xl tracking-tight text-gray-900">
                {config?.shopName || 'Mecânica Rota 430'}
              </span>
            </div>
            <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-600"><LogOut size={20} /></button>
          </div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 pb-24">
          <Outlet />
        </main>
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around px-2 z-50">
          <TabItem icon={<LayoutDashboard size={20} />} label="Início" active={location.pathname === '/'} onClick={() => navigate('/')} />
          <TabItem icon={<Package size={20} />} label="Resgatar" active={location.pathname === '/premios'} onClick={() => navigate('/premios')} />
          <TabItem icon={<User size={20} />} label="Perfil" active={location.pathname === '/perfil'} onClick={() => navigate('/perfil')} />
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 bg-black flex-col fixed inset-y-0 z-50">
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <Logo className="w-10 h-10" src={config?.logoUrl} />
          <span className="font-display font-bold text-lg text-white tracking-tight">{config?.shopName || 'Rota 430'}</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm relative ${
                location.pathname === item.path 
                ? 'bg-white text-black shadow-lg' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              {item.label}
              {item.showBadge && remindersCount > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                  {remindersCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <User size={16} />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        <header className="md:hidden bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" src={config?.logoUrl} />
            <span className="font-display font-bold text-gray-900">{config?.shopName || 'Rota 430'}</span>
          </div>
          <div className="flex items-center gap-2">
            {remindersCount > 0 && (
              <button 
                onClick={() => navigate('/lembretes')}
                className="relative p-2 text-gray-900"
              >
                <Bell size={24} />
                <span className="absolute top-1 right-1 bg-red-600 text-white text-[10px] font-black px-1 rounded-full border-2 border-white">
                  {remindersCount}
                </span>
              </button>
            )}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-900">
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-[60] md:hidden backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-black z-[70] md:hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10">
                <Logo className="w-12 h-12" src={config?.logoUrl} />
                <h2 className="text-white font-display font-bold text-xl mt-4">{config?.shopName || 'Rota 430'}</h2>
              </div>
              <nav className="flex-1 p-4 space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.path);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold relative ${
                      location.pathname === item.path 
                      ? 'bg-white text-black' 
                      : 'text-gray-400'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                    {item.showBadge && remindersCount > 0 && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-full min-w-[1.5rem] text-center">
                        {remindersCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="p-6">
                <button onClick={handleLogout} className="w-full py-4 bg-red-600/10 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2">
                  <LogOut size={20} /> Sair
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 text-sm font-semibold transition-colors ${
        active ? 'text-black' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TabItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 min-w-[64px] ${active ? 'text-black' : 'text-gray-400'}`}
    >
      {icon}
      <span className="text-[10px] font-bold mt-0.5">{label}</span>
    </button>
  );
}
