import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

    // Track if lastActive was updated this session to avoid redundant updates
    const lastActiveUpdatedRef = useRef(false);

    useEffect(() => {
      let unsubscribeAuth: (() => void) | null = null;
      let unsubscribeProfile: (() => void) | null = null;
      
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
              });
            } else {
              setUser(null);
              setLoading(false);
              lastActiveUpdatedRef.current = false;
            }
          });
        } catch (error) {
          console.error("Error initializing app:", error);
          setLoading(false);
        }
      }
      
      initialize();
    
    return () => {
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
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black">
        <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-white font-display font-bold tracking-widest text-xs uppercase animate-pulse">Iniciando Sistema...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
