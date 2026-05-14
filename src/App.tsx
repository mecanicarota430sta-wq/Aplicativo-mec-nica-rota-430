import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { getSystemConfig } from './services/dataService';
import { UserProfile, UserRole } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientPortal from './pages/ClientPortal';
import OSDetails from './pages/OSDetails';
import Clients from './pages/Clients';
import Services from './pages/Services';
import WorkOrders from './pages/WorkOrders';
import Reminders from './pages/Reminders';
import Config from './pages/Config';
import Rewards from './pages/Rewards';
import AuditLogs from './pages/AuditLogs';
import Staff from './pages/Staff';
import Profile from './pages/Profile';
import { Layout } from './components/Layout';

export default function App() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);

    // Track if lastActive was updated this session to avoid redundant updates
    const lastActiveUpdatedRef = useRef(false);

    useEffect(() => {
      let unsubscribeAuth: (() => void) | null = null;
      let unsubscribeProfile: (() => void) | null = null;
      
      // Safety timeout to prevent permanent blank screen if Firebase hangs
      const timeoutId = setTimeout(() => {
        setLoading((currentLoading) => {
          if (currentLoading) {
            console.warn("App initialization timeout - forcing load state check");
            return false;
          }
          return currentLoading;
        });
      }, 10000);

      async function initialize() {
        try {
          const c = await getSystemConfig();
          setConfig(c);

          unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            if (unsubscribeProfile) {
              unsubscribeProfile();
              unsubscribeProfile = null;
            }

            if (firebaseUser) {
              // Use real-time listener for profile
              unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
                if (docSnap.exists()) {
                  const data = docSnap.data();
                  const profile = { uid: docSnap.id, ...data } as UserProfile;
                  
                  // FORCE ADMIN role if email matches bootstrap admin (case-insensitive)
                  const isBootstrap = firebaseUser.email?.toLowerCase() === 'mecanicarota430sta@gmail.com';
                  if (isBootstrap && profile.role !== UserRole.ADMIN) {
                    profile.role = UserRole.ADMIN;
                  }

                  // Only update state if data actually changed significantly (avoid loops from timestamp updates)
                  setUser(prev => {
                    if (!prev || prev.uid !== profile.uid || prev.role !== profile.role || prev.points !== profile.points || prev.name !== profile.name) {
                      return profile;
                    }
                    return prev; 
                  });

                  // Update lastActive once per session if needed
                  if (!lastActiveUpdatedRef.current) {
                    const lastActive = data.lastActive?.toDate() || new Date(0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if (lastActive < today) {
                      lastActiveUpdatedRef.current = true;
                      updateDoc(doc(db, 'users', firebaseUser.uid), { 
                        lastActive: serverTimestamp() 
                      }).catch(err => console.error("Error updating lastActive:", err));
                    } else {
                      lastActiveUpdatedRef.current = true;
                    }
                  }
                } else {
                  console.warn("Perfil não encontrado no Firestore para UID:", firebaseUser.uid);
                  const isBootstrap = firebaseUser.email?.toLowerCase() === 'mecanicarota430sta@gmail.com';
                  if (isBootstrap) {
                    setUser({ 
                      uid: firebaseUser.uid, 
                      email: firebaseUser.email || 'mecanicarota430sta@gmail.com', 
                      name: "Admin (Sincronizando...)", 
                      role: UserRole.ADMIN,
                      points: 0 
                    } as UserProfile);
                  } else {
                    setUser(null);
                  }
                }
                setLoading(false);
                clearTimeout(timeoutId);
              }, (err) => {
                console.error("Erro ao ouvir perfil:", err);
                if (firebaseUser.email?.toLowerCase() === 'mecanicarota430sta@gmail.com') {
                   setUser({ 
                      uid: firebaseUser.uid, 
                      email: firebaseUser.email || 'mecanicarota430sta@gmail.com', 
                      name: "Admin (Modo Recuperação)", 
                      role: UserRole.ADMIN,
                      points: 0 
                    } as UserProfile);
                }
                setLoading(false);
                clearTimeout(timeoutId);
              });
            } else {
              setUser(null);
              setLoading(false);
              clearTimeout(timeoutId);
              lastActiveUpdatedRef.current = false;
            }
          });
        } catch (error) {
          console.error("Error initializing app:", error);
          setInitError("Falha na conexão com o servidor.");
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }
      
      initialize();
    
    return () => {
      clearTimeout(timeoutId);
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const refreshConfig = async () => {
    try {
      const c = await getSystemConfig();
      setConfig(c);
    } catch (err) {
      console.error("Erro ao atualizar config:", err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black overflow-hidden select-none">
        <div className="relative">
          {/* Subtle moving light background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full animate-pulse"></div>
          
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo animation */}
            <div className="relative w-32 h-32 mb-10 group">
               {/* Progress ring */}
               <svg className="absolute inset-0 w-full h-full -rotate-90">
                 <circle
                   cx="64"
                   cy="64"
                   r="60"
                   className="stroke-white/10 fill-none"
                   strokeWidth="2"
                 />
                 <circle
                   cx="64"
                   cy="64"
                   r="60"
                   className="stroke-white fill-none animate-[dash_2s_ease-in-out_infinite]"
                   strokeWidth="3"
                   strokeDasharray="100 300"
                   strokeLinecap="round"
                 />
               </svg>
               
               {/* Center Logo */}
               <div className="absolute inset-4 bg-white rounded-[2rem] flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-transform duration-500 group-hover:scale-105">
                 <span className="text-black font-display font-black text-4xl italic tracking-tighter">R</span>
                 <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full border-4 border-black flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>
                 </div>
               </div>
            </div>
            
            <div className="text-center space-y-4">
              <div className="space-y-1">
                <h1 className="text-white font-display font-black tracking-[0.3em] text-xl uppercase italic">Rota 430</h1>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] translate-x-1">Mecânica Especializada</p>
              </div>
              
              <div className="pt-6 flex flex-col items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></div>
                </div>
                <p className="text-blue-400/60 text-[9px] font-bold uppercase tracking-widest animate-pulse">Sincronizando FiveInko...</p>
              </div>
            </div>
          </div>
        </div>

        {initError && (
          <div className="absolute bottom-12 px-6 py-3 bg-red-500/5 border border-red-500/20 rounded-2xl backdrop-blur-md">
            <p className="text-red-400/80 text-[10px] font-black uppercase tracking-widest">{initError}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login config={config} /> : <Navigate to="/" />} />
        
        <Route element={<Layout user={user} config={config} />}>
          <Route 
            path="/" 
            element={
              user ? (
                user.role === UserRole.CLIENT || window.location.search.includes('view=client') 
                  ? <ClientPortal user={user} /> 
                  : <Dashboard user={user} />
              ) : (
                <Navigate to="/login" />
              )
            } 
          />
          <Route path="/clientes" element={user ? <Clients /> : <Navigate to="/login" />} />
          <Route path="/servicos" element={user ? <Services /> : <Navigate to="/login" />} />
          <Route path="/lembretes" element={user ? <Reminders /> : <Navigate to="/login" />} />
          <Route path="/os" element={user ? <WorkOrders /> : <Navigate to="/login" />} />
          <Route path="/os/:id" element={user ? <OSDetails user={user} /> : <Navigate to="/login" />} />
          <Route path="/premios" element={user ? <Rewards user={user} /> : <Navigate to="/login" />} />
          <Route path="/config" element={user ? <Config onSaveSuccess={refreshConfig} /> : <Navigate to="/login" />} />
          <Route path="/equipe" element={user && user.role === UserRole.ADMIN ? <Staff /> : <Navigate to="/" />} />
          <Route path="/logs" element={user ? <AuditLogs user={user} /> : <Navigate to="/login" />} />
          <Route path="/perfil" element={user ? <Profile user={user} onProfileUpdate={setUser} /> : <Navigate to="/login" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}

