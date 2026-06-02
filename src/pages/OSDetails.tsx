import { useState, useEffect, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { db, storage } from '../lib/firebase';
import { completeWorkOrder, getSystemConfig, updateWorkOrder, deleteWorkOrder, getServiceCatalog, sendPushNotification } from '../services/dataService';
import { WorkOrder, OSStatus, UserProfile, UserRole, Vehicle, SystemConfig, ServiceItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Camera, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowLeft,
  Upload,
  User as UserIcon,
  Car,
  Bike,
  Phone,
  Settings as SettingsIcon,
  Wrench,
  Plus,
  Trash2,
  Play,
  Hash,
  X
} from 'lucide-react';

export default function OSDetails({ user }: { user: UserProfile }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [os, setOs] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preUploadedUrl, setPreUploadedUrl] = useState<string | null>(null);
  const [finishLoading, setFinishLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSkipUpload, setShowSkipUpload] = useState(false);
  const [uploadAborted, setUploadAborted] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);

  const [clientName, setClientName] = useState('Carregando...');
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  
  // States for finishing OS
  const [finalValue, setFinalValue] = useState<number>(0);
  const [isManualValue, setIsManualValue] = useState(true);
  const [mechanicName, setMechanicName] = useState('');
  const [currentMileage, setCurrentMileage] = useState<number>(0);

  // States for itemization
  const [items, setItems] = useState<{ description: string, price: number }[]>([]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  
  // Service Catalog for suggestions
  const [catalog, setCatalog] = useState<ServiceItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Gallery state
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  
  // Deletion state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      
      const configData = await getSystemConfig();
      setConfig(configData as SystemConfig);

      const catalogData = await getServiceCatalog();
      setCatalog(catalogData);

      const docRef = doc(db, 'workOrders', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const osData = { id: snapshot.id, ...snapshot.data() } as WorkOrder;
        setOs(osData);
        setFinalValue(osData.totalValue || 0);
        setMechanicName(osData.mechanicName || '');
        setCurrentMileage(osData.currentMileage || 0);
        setItems(osData.items || []);
        setEvidencePhotos(osData.photos || []);
        
        // Fetch Client
        const clientSnap = await getDoc(doc(db, 'users', osData.clientId));
        if (clientSnap.exists()) {
          const cData = clientSnap.data() as UserProfile;
          setClientName(cData.name);
          setClientProfile(cData);
        }

        // Fetch Vehicle
        const vehicleSnap = await getDoc(doc(db, 'vehicles', osData.vehicleId));
        if (vehicleSnap.exists()) {
          const vData = vehicleSnap.data() as Vehicle;
          setVehicle(vData);
          if (!osData.currentMileage) {
            setCurrentMileage(vData.mileage || 0);
          }
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    // Auto-calculate total from items if they exist
    if (items.length > 0) {
      const sum = items.reduce((acc, item) => acc + item.price, 0);
      setFinalValue(sum);
      setIsManualValue(false);
    } else {
      setIsManualValue(true);
    }
  }, [items]);

  const handleAddItem = async () => {
    if (!newItemDesc || !newItemPrice || !os?.id) return;
    const priceNum = parseFloat(newItemPrice);
    if (isNaN(priceNum)) return;

    const updatedItems = [...items, { description: newItemDesc, price: priceNum }];
    setItems(updatedItems);
    setNewItemDesc('');
    setNewItemPrice('');

    // Persistence
    try {
      await updateWorkOrder(os.id, { 
        items: updatedItems,
        services: updatedItems.map(i => i.description), // Sync for reminders
        totalValue: updatedItems.reduce((acc, i) => acc + i.price, 0)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveItem = async (index: number) => {
    if (!os?.id) return;
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);

    try {
      await updateWorkOrder(os.id, { 
        items: updatedItems,
        services: updatedItems.map(i => i.description), // Sync for reminders
        totalValue: updatedItems.reduce((acc, i) => acc + i.price, 0)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (newStatus: OSStatus) => {
    if (!os?.id) return;
    setStatusLoading(true);
    try {
      await updateWorkOrder(os.id, { status: newStatus });
      setOs({ ...os, status: newStatus });

      // Notify Client
      let title = "🚗 Atualização do Veículo";
      let body = "";

      if (newStatus === OSStatus.IN_PROGRESS) {
        title = "🛠️ Manutenção Iniciada";
        body = `Seu veículo ${vehicle?.model || ''} está agora em manutenção.`;
      } else if (newStatus === OSStatus.WAITING_PARTS) {
        title = "📦 Aguardando Peças";
        body = `O serviço no seu ${vehicle?.model || ''} está aguardando a chegada de peças.`;
      } else if (newStatus === OSStatus.CANCELLED) {
        title = "❌ O.S. Cancelada";
        body = `A Ordem de Serviço do seu ${vehicle?.model || ''} foi cancelada.`;
      }

      if (body) {
        await sendPushNotification([os.clientId], title, body);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!os?.id || !deleteReason.trim()) return;
    setDeleting(true);
    try {
      await deleteWorkOrder(os.id, user, deleteReason);
      navigate('/ordens');
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir O.S.');
    } finally {
      setDeleting(false);
    }
  };

  const handleEvidenceUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !os?.id) return;
    
    setEvidenceUploading(true);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const fileToProcess = files[i];
        
        // Fast compression
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: false };
        const compressedFile = await imageCompression(fileToProcess, options);
        
        const fileName = `evidence_${Date.now()}_${i}_${fileToProcess.name.replace(/\s+/g, '_')}`;
        const fileRef = ref(storage, `workOrders/${os.id}/evidence/${fileName}`);
        
        await uploadBytes(fileRef, compressedFile);
        const url = await getDownloadURL(fileRef);
        newUrls.push(url);
      }

      const updatedPhotos = [...evidencePhotos, ...newUrls];
      await updateWorkOrder(os.id, { photos: updatedPhotos });
      setEvidencePhotos(updatedPhotos);
    } catch (err) {
      console.error("Error uploading evidence:", err);
      alert("Erro ao subir fotos de evidência.");
    } finally {
      setEvidenceUploading(false);
      e.target.value = '';
    }
  };

  const removeEvidence = async (urlToRemove: string) => {
    if (!os?.id) return;
    try {
      const updatedPhotos = evidencePhotos.filter(url => url !== urlToRemove);
      await updateWorkOrder(os.id, { photos: updatedPhotos });
      setEvidencePhotos(updatedPhotos);
    } catch (err) {
      console.error(err);
    }
  };

  const startPreUpload = async (fileToProcess: File) => {
    if (!os?.id) return;
    
    setUploading(true);
    setUploadProgress(0);
    setShowSkipUpload(false);
    
    // Show skip option after 8 seconds if slow
    const skipTimer = setTimeout(() => setShowSkipUpload(true), 8000);

    try {
      let fileToUpload: File | Blob = fileToProcess;
      
      // Fast compression for images
      if (fileToProcess.type.startsWith('image/')) {
        console.log("[Pre-Upload] Comprimindo imagem para upload acelerado...");
        try {
          const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: false };
          fileToUpload = await imageCompression(fileToProcess, options);
          console.log(`[Pre-Upload] Imagem comprimida de ${(fileToProcess.size / 1024 / 1024).toFixed(2)}MB para ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
        } catch (e) { 
          console.warn("[Pre-Upload] Falha na compressão, enviando original...", e); 
        }
      }

      const fileName = `os_${Date.now()}_${fileToProcess.name.replace(/\s+/g, '_')}`;
      const fileRef = ref(storage, `workOrders/${os.id}/${fileName}`);
      
      console.log("[Pre-Upload] Iniciando upload direto (uploadBytes)...");
      setUploadProgress(15);
      
      const uploadPromise = (async () => {
        const result = await uploadBytes(fileRef, fileToUpload, {
          contentType: fileToProcess.type
        });
        setUploadProgress(90);
        return result;
      })();

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout (45s): O sinal do servidor de arquivos está lento. Tente um arquivo menor ou verifique se o Storage está ativado.")), 45000)
      );

      const snapshot = await Promise.race([uploadPromise, timeoutPromise]) as any;
      console.log("[Pre-Upload] Upload bem-sucedido, obtendo URL...");
      setUploadProgress(95);
      const url = await getDownloadURL(snapshot.ref);

      setPreUploadedUrl(url);
      setUploading(false);
      setUploadProgress(100);
      console.log("[Pre-Upload] URL final gerada:", url);
    } catch (err: any) {
      console.error("[Pre-Upload] Erro detalhado:", err);
      
      // Try to explain the error better to the user
      let errorMessage = "Erro ao enviar arquivo.";
      if (err.message?.includes("Timeout")) {
        errorMessage = err.message;
      } else if (err.code === "storage/unauthorized") {
        errorMessage = "Sem permissão para subir arquivos. Verifique se o Storage está ativado nas configurações do Firebase.";
      } else if (err.code === "storage/canceled") {
        errorMessage = "Upload cancelado.";
      } else if (err.message) {
        errorMessage = `Erro técnico: ${err.message}`;
      }
      
      setFinishError(errorMessage);
      setUploading(false);
      setShowSkipUpload(true); // Always show skip on error
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 50 * 1024 * 1024) {
        alert("O arquivo é muito grande (Máximo 50MB)");
        return;
      }
      setFile(selectedFile);
      setFinishError(null);
      setPreUploadedUrl(null); // Reset URL on new file choice
      setUploadAborted(false);
      
      // Clear value to allow selecting same file again
      e.target.value = '';
      
      // Start flow immediately
      startPreUpload(selectedFile);
    }
  };

  const handleFinishOS = async () => {
    if (!os?.id || finishLoading) return;

    if (!file && !os.pdfUrl) {
      setFinishError("É obrigatório anexar o PDF ou Foto do serviço para finalizar.");
      return;
    }

    if (file && !preUploadedUrl && !uploading) {
      setFinishError("O upload do arquivo falhou ou foi interrompido. Selecione o arquivo novamente.");
      return;
    }

    if (!navigator.onLine) {
      setFinishError("Seu dispositivo parece estar offline. Verifique sua conexão para finalizar a O.S.");
      return;
    }
    
    const finalMechanic = mechanicName.trim() || config?.shopName || 'Oficina Responsável';
    
    setFinishLoading(true);
    setFinishError(null);
    const startTime = Date.now();

    // Safety timeout for the entire process (90 seconds)
    const timeoutId = setTimeout(() => {
      if (finishLoading) {
        setFinishError("O tempo limite foi atingido. Verifique sua internet.");
        setFinishLoading(false);
      }
    }, 90000);

    try {
      let pdfUrl = preUploadedUrl || os.pdfUrl;
      
      // Wait for pre-upload if it's still running
      if (uploading && !preUploadedUrl) {
        console.log("[UI] Aguardando conclusão do upload em andamento...");
        setFinishError("Aguardando o fim do envio do arquivo... Por favor, espere um momento.");
        
        let waitAttempts = 0;
        // Wait up to 45 seconds (90 * 500ms)
        while (uploading && waitAttempts < 90) {
          await new Promise(r => setTimeout(r, 500));
          waitAttempts++;
          if (preUploadedUrl) {
            pdfUrl = preUploadedUrl;
            setFinishError(null);
            break;
          }
        }

        if (!pdfUrl) {
          throw new Error("O envio do arquivo demorou muito ou falhou. Tente selecionar o arquivo novamente.");
        }
      }

      if (!pdfUrl) {
        throw new Error("Por favor, selecione e aguarde o upload do arquivo.");
      }

      console.log("[UI] Chamando persistência no banco...");
      await completeWorkOrder(os.id, pdfUrl, finalValue, finalMechanic, currentMileage);
      console.log("[UI] Fluxo finalizado no banco.");

      // Notify Client Push
      await sendPushNotification(
        [os.clientId],
        "✅ Serviço Finalizado!",
        `O atendimento do seu veículo ${vehicle?.model || ''} foi concluído com sucesso.`
      );
      
      if (notifyWhatsApp && clientProfile?.phone) {
        try {
          const phone = clientProfile.phone.replace(/\D/g, '');
          const message = `Olá ${clientName}! Sua Ordem de Serviço na ${config?.shopName || 'Mecânica Rota 430'} foi finalizada. 🛠️\n\n✅ Status: Concluída\n💰 Valor Total: R$ ${(finalValue || 0).toFixed(2)}\n⭐ Pontos Fidelidade: +${Math.floor(finalValue || 0)}\n\n📄 Você pode conferir os detalhes aqui: ${pdfUrl || 'Disponível no Portal do Cliente'}\n\nObrigado pela confiança!`;
          const waUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
          window.open(waUrl, '_blank');
        } catch (waErr) {
          console.error("Erro ao abrir WhatsApp:", waErr);
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`[UI] Processo total levou ${duration}s`);

      clearTimeout(timeoutId);
      alert('Ordem de Serviço finalizada com sucesso!');
      navigate('/');
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("[UI] Erro fatal ao finalizar OS:", error);
      setFinishError(error.message || 'Erro de conexão ou sistema. Verifique os logs.');
    } finally {
      setUploading(false);
      setFinishLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Carregando detalhes...</div>;
  if (!os) return <div className="p-8 text-center text-red-500 font-bold">OS não encontrada.</div>;

  const isCompleted = os.status === OSStatus.COMPLETED;
  const canModify = !isCompleted && user.role !== UserRole.CLIENT;

  const getStatusDisplay = (status: OSStatus) => {
    switch (status) {
      case OSStatus.COMPLETED:
        return { label: 'Finalizada', color: 'bg-emerald-500 text-white' };
      case OSStatus.IN_PROGRESS:
        return { label: 'Em Manutenção', color: 'bg-violet-600 text-white' };
      case OSStatus.WAITING_PARTS:
        return { label: 'Aguardando Peças', color: 'bg-amber-600 text-white' };
      default:
        return { label: 'Aberta', color: 'bg-blue-600 text-white' };
    }
  };

  const statusInfo = getStatusDisplay(os.status);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-8">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-bold uppercase text-[10px] tracking-widest"
        >
          <ArrowLeft size={16} />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-3">
           {user.role === UserRole.ADMIN && (
             <button 
               onClick={() => setIsDeleteModalOpen(true)}
               className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-100"
             >
               Excluir O.S.
             </button>
           )}
           {os.status === OSStatus.OPEN && canModify && (
             <button 
               onClick={() => handleUpdateStatus(OSStatus.IN_PROGRESS)}
               disabled={statusLoading}
               className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-violet-100"
             >
               {statusLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play size={14} />}
               Iniciar Manutenção
             </button>
           )}
           <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${statusInfo.color}`}>
             {statusInfo.label}
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-black p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">Registro de Atendimento</p>
              {vehicle && (
                <span className="px-2 py-0.5 bg-white/10 rounded-lg text-[10px] font-black text-white/60 tracking-widest border border-white/10 uppercase">
                  {vehicle.licensePlate}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-display font-bold">{os.seqId || `O.S. #${os.id?.slice(-6).toUpperCase()}`}</h1>
            <p className="text-gray-400 text-xs mt-2 font-medium">
              Criada em: {os.createdAt ? new Date((os.createdAt as any).toDate?.() || os.createdAt).toLocaleDateString() : 'Aguardando...'}
              {vehicle && ` • ${vehicle.brand} ${vehicle.model}`}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="text-right hidden md:block">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Previsto</p>
               <p className="text-2xl font-display font-bold">R$ {(finalValue || 0).toFixed(2)}</p>
             </div>
          </div>
        </div>

        <div className="p-8 md:p-10 grid md:grid-cols-2 gap-12">
          <div className="space-y-10">
            {/* Identificação do Atendimento */}
            <section>
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <UserIcon size={12} strokeWidth={3} /> Identificação do Atendimento
              </h2>
              <div className="space-y-4">
                {/* Client Box */}
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 group">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{clientName}</p>
                      <span className="text-blue-600 font-bold text-xs">{clientProfile?.points || 0} pts</span>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      {clientProfile?.phone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                          <Phone size={12} className="text-gray-300" /> {clientProfile.phone}
                        </p>
                      )}
                      {clientProfile?.cpf && (
                        <p className="text-[10px] text-gray-400 flex items-center gap-1 font-mono uppercase tracking-widest">
                          <Hash size={10} className="text-gray-300" /> {clientProfile.cpf}
                        </p>
                      )}
                    </div>
                </div>

                {/* Vehicle Box */}
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-gray-400 shadow-sm border border-gray-50">
                        {vehicle?.type === 'MOTORCYCLE' ? <Bike size={24} /> : <Car size={24} />}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{vehicle?.brand} {vehicle?.model}</p>
                        <p className="font-bold text-gray-900 uppercase tracking-widest">{vehicle?.licensePlate}</p>
                      </div>
                   </div>
                   {vehicle && (
                     <div className="grid grid-cols-2 gap-6 pt-2 border-t border-gray-200/50">
                        <div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Cor / Ano</span>
                          <p className="font-bold text-gray-800 text-xs">{vehicle.color || '-'} / {vehicle.year || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">KM Atual</span>
                          <p className="font-bold text-gray-800 text-xs font-mono">{vehicle.mileage?.toLocaleString() || 0} km</p>
                        </div>
                     </div>
                   )}
                </div>
              </div>
            </section>
            
            {/* Foto de Indicação / Referência do Serviço */}
            <section className="animate-in fade-in slide-in-from-bottom-3 duration-700">
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Camera size={12} strokeWidth={3} /> Galeria de Referência / Evidências
                 </div>
                 {evidenceUploading && <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />}
               </h2>
               
               <div className="grid grid-cols-3 gap-3">
                 <AnimatePresence>
                   {evidencePhotos.map((url, idx) => (
                      <motion.div 
                        key={url}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="relative aspect-square rounded-2xl overflow-hidden group border border-gray-100 shadow-sm"
                      >
                        <img src={url} alt="Evidência" className="w-full h-full object-cover" />
                        {canModify && (
                          <button 
                            onClick={() => removeEvidence(url)}
                            className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <a 
                          href={url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                        >
                          <Plus size={20} />
                        </a>
                      </motion.div>
                   ))}
                 </AnimatePresence>
                 
                 {canModify && evidencePhotos.length < 9 && (
                   <div className="relative aspect-square border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer group">
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={handleEvidenceUpload}
                        disabled={evidenceUploading}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <Plus className="text-gray-300 group-hover:text-black transition-colors" size={24} />
                      <span className="text-[8px] font-black uppercase text-gray-400 group-hover:text-black transition-colors">Add Foto</span>
                   </div>
                 )}
                 
                 {evidencePhotos.length === 0 && !canModify && (
                   <div className="col-span-3 py-6 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhuma foto adicionada</p>
                   </div>
                 )}
               </div>
            </section>

            {/* Mechanics/Responsible */}
            {canModify && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                  <Wrench size={12} strokeWidth={3} /> Responsável, KM e Valor Total
                </h2>
                <div className="space-y-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={mechanicName}
                      onChange={(e) => setMechanicName(e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold focus:ring-2 focus:ring-black outline-none transition-all pl-12 text-sm"
                      placeholder={config?.shopName || "Nome do Responsável"}
                    />
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input 
                        type="number" 
                        value={currentMileage}
                        onChange={(e) => setCurrentMileage(Number(e.target.value))}
                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-mono font-bold focus:ring-2 focus:ring-black outline-none transition-all pl-12 text-sm"
                        placeholder="KM Atual"
                      />
                      <SettingsIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xs font-bold font-mono">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        value={finalValue}
                        onChange={(e) => isManualValue && setFinalValue(Number(e.target.value))}
                        readOnly={!isManualValue}
                        className={`w-full p-4 border border-gray-100 rounded-2xl font-mono font-bold focus:ring-2 focus:ring-black outline-none transition-all pl-12 text-sm ${
                          !isManualValue ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900'
                        }`}
                        placeholder="Valor Total"
                      />
                      {!isManualValue && (
                        <div className="absolute -top-2 right-2 px-2 bg-black text-white text-[8px] font-black uppercase tracking-widest rounded-full">Automático</div>
                      )}
                    </div>
                  </div>
                  {isManualValue && items.length === 0 && (
                     <p className="text-[10px] text-gray-400 font-medium px-2 italic">
                       * Como não há itens listados, você pode digitar o valor total manualmente.
                     </p>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-10">
            {/* ITENS DA O.S. (The core request) */}
            <section>
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <SettingsIcon size={12} strokeWidth={3} /> Itens Executados
                </div>
                {!isCompleted && <span>R$ {(finalValue || 0).toFixed(2)}</span>}
              </h2>
              
              <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {items.length === 0 && (
                  <div className="py-12 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-100 text-center">
                    <p className="text-gray-400 text-xs font-medium">Nenhum item adicionado ainda.</p>
                  </div>
                )}
                <AnimatePresence>
                  {items.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl group shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 text-sm truncate uppercase tracking-tight">{item.description}</p>
                        <p className="text-xs font-mono font-bold text-gray-400">R$ {item.price.toFixed(2)}</p>
                      </div>
                      {canModify && (
                        <button 
                          onClick={() => handleRemoveItem(idx)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all ml-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {canModify && (
                <div className="p-5 bg-gray-900 rounded-[2rem] space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Descrição da peça ou serviço" 
                        value={newItemDesc}
                        onChange={(e) => {
                          setNewItemDesc(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        className="w-full px-5 py-3 bg-white/10 border border-white/10 rounded-xl text-white text-sm outline-none placeholder:text-white/30 focus:border-white/30 transition-all font-medium"
                      />
                      
                      {/* Suggestions Dropdown */}
                      <AnimatePresence>
                        {showSuggestions && newItemDesc.length >= 2 && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-[60] left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden max-h-48 overflow-y-auto"
                          >
                            {catalog
                              .filter(s => s.name.toLowerCase().includes(newItemDesc.toLowerCase()))
                              .map((service, sidx) => (
                                <button
                                  key={sidx}
                                  onClick={() => {
                                    setNewItemDesc(service.name);
                                    setNewItemPrice(service.price.toString());
                                    setShowSuggestions(false);
                                  }}
                                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                                >
                                  <span className="text-sm font-bold text-gray-800 uppercase tracking-tight">{service.name}</span>
                                  <span className="text-xs font-mono font-bold text-blue-600">R$ {(service.price || 0).toFixed(2)}</span>
                                </button>
                              ))}
                            {catalog.filter(s => s.name.toLowerCase().includes(newItemDesc.toLowerCase())).length === 0 && (
                              <div className="px-4 py-3 text-xs text-gray-400 italic">
                                Pressione {newItemDesc} para continuar...
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {showSuggestions && (
                        <div 
                          className="fixed inset-0 z-[50]" 
                          onClick={() => setShowSuggestions(false)} 
                        />
                      )}
                    </div>
                    
                    <div className="flex gap-2 relative z-[51]">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-xs font-bold">R$</span>
                        <input 
                          type="number" 
                          step="0.01"
                          placeholder="Valor" 
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white text-sm outline-none placeholder:text-white/30 focus:border-white/30 transition-all font-mono font-bold"
                        />
                      </div>
                      <button 
                        onClick={handleAddItem}
                        className="p-3 bg-white text-black rounded-xl hover:bg-gray-200 transition-all shadow-xl active:scale-95"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Documentation / Completion */}
            <section className="pt-4">
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                 <Camera size={12} strokeWidth={3} /> Documentação Externa (PDF/Foto)
               </h2>
               
               {os.pdfUrl && (
                  <a 
                    href={os.pdfUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-4 p-5 bg-blue-50 text-blue-700 rounded-3xl border border-blue-100 hover:bg-blue-100 transition-colors mb-6 shadow-sm group"
                  >
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                       <FileText size={24} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-sm">Acessar Documento Anexo</p>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Laudo / NF / Relatório Externo</p>
                    </div>
                  </a>
               )}

               {canModify && (
                 <div className="space-y-6">
                    <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-all relative group">
                        <input 
                          type="file" 
                          accept=".pdf,image/*" 
                          onChange={handleFileChange}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-black shadow-sm mb-3 transition-colors">
                          <Upload size={24} />
                        </div>
                        <p className="text-xs font-bold text-gray-700 text-center uppercase tracking-widest">
                          {file ? file.name : "Anexar PDF do outro sistema"}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">PNG, JPG ou PDF (Máx: 50MB)</p>
                        {file && !uploading && !preUploadedUrl && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                              setPreUploadedUrl(null);
                              setUploadProgress(0);
                            }}
                            className="mt-2 text-[8px] font-black text-red-500 uppercase tracking-widest underline"
                          >
                            Tentar outro arquivo
                          </button>
                        )}
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl flex items-start gap-4">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="text-xs text-amber-900 font-bold">Resumo da Finalização</p>
                          <p className="text-[10px] text-amber-700 font-medium leading-relaxed mt-1">
                            A conclusão irá creditar <strong className="text-amber-900">{Math.floor(finalValue)} pontos</strong> fidelidade. 
                            <strong> É obrigatório:</strong> Valor Total preenchido e O.S. (PDF/Foto) do outro sistema anexada.
                          </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <input 
                        type="checkbox" 
                        id="notifyWhatsApp"
                        checked={notifyWhatsApp}
                        onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                        className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                      />
                      <label htmlFor="notifyWhatsApp" className="text-xs font-bold text-emerald-900 cursor-pointer select-none">
                        Avisar cliente via WhatsApp ao finalizar ?
                      </label>
                    </div>

                     <button
                        onClick={handleFinishOS}
                        disabled={finishLoading || uploading || finalValue <= 0 || (!file && !os.pdfUrl) || os.status === OSStatus.OPEN}
                        className="w-full py-5 bg-black hover:bg-gray-800 disabled:bg-gray-300 text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                      >
                        {finishLoading ? (
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 size={24} />
                            <span>Concluir Atendimento</span>
                          </>
                        )}
                      </button>

                      {/* Explicit Validation Messages */}
                      <div className="space-y-1 text-center">
                        {uploading && (
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mt-4 relative">
                            <motion.div 
                              className="h-full bg-emerald-500 absolute left-0" 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                               <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest drop-shadow-sm">
                                 Sincronizando: {Math.round(uploadProgress)}%
                               </p>
                            </div>
                          </div>
                        )}

                        {preUploadedUrl && (
                           <div className="flex items-center justify-center gap-2 mt-4 text-emerald-600">
                             <CheckCircle2 size={14} />
                             <p className="text-[10px] font-black uppercase tracking-widest">Arquivo Pronto para Finalizar</p>
                           </div>
                        )}

                        {finishError && (
                          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl mb-4">
                             <p className="text-xs text-red-600 font-bold">{finishError}</p>
                             <button 
                               onClick={() => setFinishError(null)}
                               className="text-[10px] text-red-400 font-black uppercase tracking-widest mt-2 underline"
                             >
                               Limpar Erro
                             </button>
                          </div>
                        )}

                        {os.status === OSStatus.OPEN && (
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                            ⚠️ Inicie a manutenção primeiro
                          </p>
                        )}
                        {finalValue <= 0 && os.status !== OSStatus.OPEN && (
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                            ⚠️ Adicione Itens ou um Valor Total
                          </p>
                        )}
                        {!file && !os.pdfUrl && os.status !== OSStatus.OPEN && (
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                            ⚠️ Anexo (PDF/Foto) é Obrigatório
                          </p>
                        )}
                      </div>
                 </div>
               )}

               {isCompleted && !os.pdfUrl && (
                  <div className="p-10 bg-gray-50 rounded-[2.5rem] border border-gray-100 text-center">
                    <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-4" />
                    <p className="text-gray-900 font-bold text-lg">Atendimento Concluído</p>
                    <p className="text-gray-400 text-xs font-medium mt-1">Todos os pontos foram devidamente creditados.</p>
                  </div>
               )}
            </section>
          </div>
        </div>
      </div>

      {/* Deletion Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsDeleteModalOpen(false)} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }} 
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8 border border-white/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Excluir Ordem</h2>
                  <p className="text-gray-400 text-sm font-medium mt-1">Esta ação é irreversível.</p>
                </div>
                <button 
                  onClick={() => setIsDeleteModalOpen(false)} 
                  className="p-3 bg-gray-50 text-gray-400 hover:text-black rounded-2xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                 <div className="bg-red-50 border border-red-100 p-4 rounded-3xl flex items-start gap-4">
                    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-[10px] text-red-700 font-bold leading-relaxed uppercase tracking-widest">
                       Atenção: A exclusão será registrada nos logs de auditoria do sistema.
                    </p>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Motivo da Exclusão</label>
                    <textarea 
                      required
                      placeholder="Descreva o motivo..."
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-medium focus:ring-2 focus:ring-red-500 outline-none transition-all h-32 resize-none"
                    />
                 </div>

                 <button
                    onClick={handleDelete}
                    disabled={deleting || !deleteReason.trim()}
                    className="w-full py-5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                 >
                    {deleting ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={24} />
                        <span>Confirmar Exclusão</span>
                      </>
                    )}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

