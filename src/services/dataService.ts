import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  runTransaction, 
  serverTimestamp,
  increment,
  addDoc,
  deleteDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { WorkOrder, OSStatus, UserRole, UserProfile, OperationType, FirestoreErrorInfo, Vehicle, ServiceItem, AuditLog, ReminderRecord } from '../types';
import { orderBy as firestoreOrderBy } from 'firebase/firestore';

export async function logAction(user: UserProfile, action: string, details: string, targetId?: string) {
  try {
    await addDoc(collection(db, 'logs'), {
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action,
      details,
      targetId: targetId || null,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log action:", error);
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface MaintenanceReminder {
  id: string;
  client: UserProfile;
  vehicle: Vehicle;
  serviceName: string;
  lastServiceDate: Date;
  lastMileage: number;
  dueMonths?: number;
  dueKm?: number;
  isOverdueTime: boolean;
  isOverdueKm: boolean;
  type?: 'MAINTENANCE' | 'BIRTHDAY';
  status?: 'PENDING' | 'SENT' | 'MISSED' | 'DELAYED_SENT';
}

export async function syncReminders(): Promise<void> {
  try {
    const maintenance = await calculateMaintenanceReminders();
    const birthdays = await calculateBirthdayReminders();
    const allCalculated = [...maintenance, ...birthdays];

    const batch = writeBatch(db);
    let count = 0;

    // 1. Cleanup: Delete reminders older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const qOld = query(collection(db, 'reminders'), where('scheduledDate', '<', Timestamp.fromDate(thirtyDaysAgo)));
    const oldSnap = await getDocs(qOld);
    if (!oldSnap.empty) {
      oldSnap.docs.forEach(d => batch.delete(d.ref));
      console.log(`[syncReminders] ${oldSnap.size} lembretes antigos removidos.`);
    }

    // 2. Add/Update: Prevent "superimposition" using deterministic IDs
    for (const rem of allCalculated) {
      // Create a unique key for this specific reminder context: client + (vehicle || '') + type + service
      const uniqueKey = `${rem.client.uid}_${rem.vehicle?.id || 'no-vehicle'}_${rem.type || 'MAINTENANCE'}_${rem.serviceName.replace(/\s+/g, '_')}`;
      const reminderRef = doc(db, 'reminders', uniqueKey);
      const snap = await getDoc(reminderRef);

      // Only create if it doesn't exist OR update if it was missed but is now relevant again
      if (!snap.exists() || snap.data()?.status === 'MISSED') {
        const newRecord: ReminderRecord = {
          clientId: rem.client.uid,
          clientName: rem.client.name,
          clientPhone: rem.client.phone,
          vehicleId: rem.vehicle?.id,
          vehiclePlate: rem.vehicle?.licensePlate,
          vehicleModel: rem.vehicle?.model,
          type: rem.type || 'MAINTENANCE',
          serviceName: rem.serviceName,
          status: 'PENDING',
          scheduledDate: serverTimestamp(),
          lastServiceDate: Timestamp.fromDate(rem.lastServiceDate),
          lastMileage: rem.lastMileage,
          dueMonths: rem.dueMonths,
          dueKm: rem.dueKm,
          createdAt: serverTimestamp()
        };
        batch.set(reminderRef, newRecord, { merge: true });
        count++;
      }
    }

    if (count > 0 || !oldSnap.empty) {
      await batch.commit();
      console.log(`[syncReminders] Processo concluído: ${count} lembretes sincronizados.`);
    }

    // 3. Auto-mark as MISSED if older than 7 days and still PENDING
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const qMissed = query(
      collection(db, 'reminders'), 
      where('status', '==', 'PENDING'), 
      where('scheduledDate', '<', Timestamp.fromDate(weekAgo))
    );
    const missedSnap = await getDocs(qMissed);
    if (!missedSnap.empty) {
      const missedBatch = writeBatch(db);
      missedSnap.docs.forEach(d => {
        missedBatch.update(d.ref, { status: 'MISSED', updatedAt: serverTimestamp() });
      });
      await missedBatch.commit();
    }

  } catch (error) {
    console.error("Error syncing reminders:", error);
  }
}

export async function updateReminderStatus(reminderId: string, status: ReminderRecord['status'], messageOverride?: string) {
  try {
    const ref = doc(db, 'reminders', reminderId);
    await updateDoc(ref, {
      status,
      sentAt: serverTimestamp(),
      messageOverride: messageOverride || null,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating reminder status:", error);
  }
}

export async function getRemindersHistory(): Promise<ReminderRecord[]> {
  try {
    const q = query(collection(db, 'reminders'), firestoreOrderBy('scheduledDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReminderRecord));
  } catch (error) {
    console.error("Error fetching reminders history:", error);
    return [];
  }
}

export async function calculateMaintenanceReminders(): Promise<MaintenanceReminder[]> {
  try {
    const config = await getSystemConfig();
    const referenceDate = config.customSystemDate ? new Date(config.customSystemDate) : new Date();

    // 1. Fetch Services (Catalog)
    const servicesSnap = await getDocs(collection(db, 'catalog'));
    const servicesMap: Record<string, ServiceItem> = {};
    servicesSnap.docs.forEach(doc => {
      servicesMap[doc.data().name] = { id: doc.id, ...doc.data() } as ServiceItem;
    });

    // 2. Fetch completed Work Orders
    const osQuery = query(collection(db, 'workOrders'), where('status', '==', OSStatus.COMPLETED), firestoreOrderBy('completedAt', 'desc'));
    const osSnap = await getDocs(osQuery);
    const workOrders = osSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkOrder));

    // 3. Latest services record
    const latestServices: Record<string, WorkOrder> = {};
    workOrders.forEach(wo => {
      wo.services.forEach(serviceName => {
        const key = `${wo.vehicleId}_${serviceName}`;
        if (!latestServices[key]) {
          latestServices[key] = wo;
        }
      });
    });

    // 4. Fetch necessary data
    const clientsSnap = await getDocs(collection(db, 'users'));
    const clientsMap: Record<string, UserProfile> = {};
    clientsSnap.docs.forEach(doc => {
      clientsMap[doc.id] = { uid: doc.id, ...doc.data() } as UserProfile;
    });

    const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
    const vehiclesMap: Record<string, Vehicle> = {};
    vehiclesSnap.docs.forEach(doc => {
      vehiclesMap[doc.id] = { id: doc.id, ...doc.data() } as Vehicle;
    });

    // 5. Calculate
    const calculatedReminders: MaintenanceReminder[] = [];
    const now = referenceDate;

    Object.keys(latestServices).forEach(key => {
      const wo = latestServices[key];
      const serviceName = key.split('_').slice(1).join('_');
      const catalogService = servicesMap[serviceName];

      if (catalogService && (catalogService.maintenanceIntervalMonths || catalogService.maintenanceIntervalKm)) {
        const lastDate = wo.completedAt?.toDate?.() || new Date(wo.completedAt);
        const monthsPassed = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        
        const lastMileage = wo.currentMileage || 0;
        const currentVehicleMileage = vehiclesMap[wo.vehicleId]?.mileage || 0;
        const kmPassed = currentVehicleMileage - lastMileage;

        const isOverdueTime = catalogService.maintenanceIntervalMonths ? monthsPassed >= catalogService.maintenanceIntervalMonths : false;
        const isOverdueKm = catalogService.maintenanceIntervalKm ? kmPassed >= catalogService.maintenanceIntervalKm : false;

        if (isOverdueTime || isOverdueKm) {
          calculatedReminders.push({
            id: `${wo.id}_${serviceName}`,
            client: clientsMap[wo.clientId],
            vehicle: vehiclesMap[wo.vehicleId],
            serviceName,
            lastServiceDate: lastDate,
            lastMileage: lastMileage,
            dueMonths: catalogService.maintenanceIntervalMonths,
            dueKm: catalogService.maintenanceIntervalKm,
            isOverdueTime,
            isOverdueKm
          });
        }
      }
    });

    return calculatedReminders;
  } catch (error) {
    console.error("Error calculating maintenance reminders:", error);
    return [];
  }
}

export async function calculateBirthdayReminders(): Promise<MaintenanceReminder[]> {
  try {
    const config = await getSystemConfig();
    const referenceDate = config.customSystemDate ? new Date(config.customSystemDate) : new Date();

    const clientsSnap = await getDocs(collection(db, 'users'));
    const clients = clientsSnap.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
      .filter(u => u.role === UserRole.CLIENT && u.birthDate);

    const now = referenceDate;
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const reminders: MaintenanceReminder[] = [];

    clients.forEach(client => {
      if (client.birthDate) {
        const [year, month, day] = client.birthDate.split('-').map(Number);
        
        // Check if birthday is today or within next 3 days (optional, user just said "estar de aniversario")
        // Usually, in these systems, it's "today's birthdays"
        if (month === currentMonth && day === currentDay) {
          reminders.push({
            id: `birthday_${client.uid}`,
            client,
            vehicle: {} as any, // No specific vehicle for birthday
            serviceName: 'Aniversário',
            lastServiceDate: new Date(year, month - 1, day),
            lastMileage: 0,
            isOverdueTime: true,
            isOverdueKm: false,
            type: 'BIRTHDAY'
          });
        }
      }
    });

    return reminders;
  } catch (error) {
    console.error("Error calculating birthday reminders:", error);
    return [];
  }
}

export async function createWorkOrder(clientId: string, vehicleId: string) {
  const counterRef = doc(db, 'system', 'counters');
  const osCollectionRef = collection(db, 'workOrders');

  try {
    const result = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let nextId = 1;
      
      if (counterSnap.exists()) {
        nextId = (counterSnap.data().lastOsId || 0) + 1;
      }

      const seqId = `OS-${nextId.toString().padStart(5, '0')}`;
      const newOsRef = doc(osCollectionRef); // Generate a unique Firestore ID

      const newOS = {
        seqId,
        clientId,
        vehicleId,
        status: OSStatus.OPEN,
        services: [],
        items: [],
        totalValue: 0,
        totalPoints: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(newOsRef, newOS);
      transaction.set(counterRef, { lastOsId: nextId }, { merge: true });

      return { id: newOsRef.id, seqId };
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workOrders');
    throw error;
  }
}

export async function updateWorkOrder(workOrderId: string, data: Partial<WorkOrder>) {
  const woRef = doc(db, 'workOrders', workOrderId);
  try {
    await updateDoc(woRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `workOrders/${workOrderId}`);
  }
}

export async function deleteWorkOrder(workOrderId: string, user: UserProfile, reason: string) {
  try {
    await logAction(user, 'DELETE_OS', `Motivo: ${reason}`, workOrderId);
    await deleteDoc(doc(db, 'workOrders', workOrderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `workOrders/${workOrderId}`);
  }
}

export async function cleanOldLogs() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  try {
    const q = query(collection(db, 'logs'), where('timestamp', '<', Timestamp.fromDate(sevenDaysAgo)));
    const snap = await getDocs(q);
    
    if (snap.empty) return;
    
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`${snap.size} logs antigos foram removidos.`);
  } catch (error) {
    console.error("Erro ao limpar logs:", error);
  }
}

export async function completeWorkOrder(workOrderId: string, pdfUrl?: string, finalValue?: number, mechanicName?: string, mileage?: number) {
  if (!workOrderId) throw new Error("ID da O.S. não informado.");
  const woRef = doc(db, 'workOrders', workOrderId);
  
  console.log(`[dataService] Iniciando finalização da OS: ${workOrderId}`);

  try {
    await runTransaction(db, async (transaction) => {
      console.log("[dataService] Transação iniciada...");
      
      const woDoc = await transaction.get(woRef);
      if (!woDoc.exists()) throw new Error("O.S. não encontrada.");
      
      const woData = woDoc.data() as WorkOrder;
      if (woData.status === OSStatus.COMPLETED) {
        console.warn("[dataService] OS já estava finalizada.");
        return; // Early exit within transaction
      }

      const clientRef = doc(db, 'users', woData.clientId);
      const clientDoc = await transaction.get(clientRef);
      if (!clientDoc.exists()) throw new Error("Cadastro do cliente não encontrado.");

      const actualValue = finalValue !== undefined ? finalValue : woData.totalValue;
      const pointsToCredit = Math.floor(actualValue);

      console.log(`[dataService] Creditando ${pointsToCredit} pontos para o cliente.`);

      const updateData: any = {
        status: OSStatus.COMPLETED,
        pdfUrl: pdfUrl || woData.pdfUrl || "",
        totalValue: actualValue,
        totalPoints: pointsToCredit,
        mechanicName: mechanicName || woData.mechanicName || "",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (mileage !== undefined) {
        updateData.currentMileage = mileage;
      }

      // Perform updates
      transaction.update(woRef, updateData);

      if (mileage !== undefined && woData.vehicleId) {
        const vehicleRef = doc(db, 'vehicles', woData.vehicleId);
        transaction.update(vehicleRef, {
          mileage: mileage,
          updatedAt: serverTimestamp()
        });
      }

      transaction.update(clientRef, {
        points: increment(pointsToCredit),
        updatedAt: serverTimestamp()
      });

      console.log("[dataService] Comandos de transação enfileirados.");
    }, { maxAttempts: 3 }); // Limit retries to avoid infinite hangs

    console.log("[dataService] Transação concluída com sucesso.");
  } catch (error: any) {
    console.error("[dataService] Erro fatal na transação:", error);
    throw new Error(error.message || "Erro de banco de dados ao finalizar.");
  }
}

export async function getServiceCatalog(): Promise<ServiceItem[]> {
  try {
    const snap = await getDocs(collection(db, 'catalog'));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceItem));
  } catch (error) {
    console.error("Error fetching service catalog:", error);
    return [];
  }
}

export async function syncCpfLookup(uid: string, name: string, email: string, cpf?: string) {
  if (!cpf) return;
  const normalizedCpf = cpf.replace(/\D/g, "");
  if (!normalizedCpf) return;

  try {
    const lookupRef = doc(db, 'cpf_lookup', normalizedCpf);
    await setDoc(lookupRef, {
      uid,
      name,
      email,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Failed to sync CPF lookup:", error);
  }
}

export async function bulkSyncCpfLookup(clients: { uid: string; name: string; email: string; cpf: string }[]) {
  const CHUNK_SIZE = 450; // Leave some margin for other operations
  let totalProcessed = 0;

  for (let i = 0; i < clients.length; i += CHUNK_SIZE) {
    const chunk = clients.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    let countInBatch = 0;

    chunk.forEach(client => {
      const normalizedCpf = client.cpf.replace(/\D/g, "");
      if (normalizedCpf) {
        const lookupRef = doc(db, 'cpf_lookup', normalizedCpf);
        batch.set(lookupRef, {
          uid: client.uid,
          name: client.name || "Cliente Rota 430",
          email: client.email || "",
          updatedAt: serverTimestamp()
        }, { merge: true });
        countInBatch++;
      }
    });

    if (countInBatch > 0) {
      await batch.commit();
      totalProcessed += countInBatch;
    }
  }

  return totalProcessed;
}

export async function recoverOrphanedData(currentUid: string, cpf?: string, email?: string) {
  if (!currentUid || (!cpf && !email)) return false;
  
  const normalizedCpf = cpf?.replace(/\D/g, "");
  
  try {
    const profilesToMerge: any[] = [];
    
    // 1. Try to find the old UID via CPF Lookup first (most reliable)
    if (normalizedCpf) {
      const lookupRef = doc(db, 'cpf_lookup', normalizedCpf);
      const lookupSnap = await getDoc(lookupRef);
      if (lookupSnap.exists()) {
        const oldUid = lookupSnap.data().uid;
        if (oldUid && oldUid !== currentUid) {
          const oldProfileSnap = await getDoc(doc(db, 'users', oldUid));
          if (oldProfileSnap.exists()) {
            profilesToMerge.push({ id: oldUid, ...oldProfileSnap.data() });
          }
        }
      }
    }

    // 2. Also search by CPF directly in users (as fallback)
    if (normalizedCpf) {
      const qCpf = query(collection(db, 'users'), where('cpf', '==', normalizedCpf));
      const snapCpf = await getDocs(qCpf);
      snapCpf.docs.forEach(d => {
        if (d.id !== currentUid && !profilesToMerge.find(p => p.id === d.id)) {
          profilesToMerge.push({ id: d.id, ...d.data() });
        }
      });
    }
    
    // 3. Search by Email
    if (email) {
      const qEmail = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
      const snapEmail = await getDocs(qEmail);
      snapEmail.docs.forEach(d => {
        if (d.id !== currentUid && !profilesToMerge.find(p => p.id === d.id)) {
          profilesToMerge.push({ id: d.id, ...d.data() });
        }
      });
    }

    if (profilesToMerge.length === 0) return false;

    console.log(`[AutoRecover] Merging ${profilesToMerge.length} profiles into ${currentUid}`);
    
    const batch = writeBatch(db);
    let totalPoints = 0;

    for (const oldProfile of profilesToMerge) {
      totalPoints += (oldProfile.points || 0);
      
      // Update Vehicles - Limit to avoid hitting batch limits if someone has 500 cars (unlikely but safe)
      const vQuery = query(collection(db, 'vehicles'), where('clientId', '==', oldProfile.id));
      const vSnap = await getDocs(vQuery);
      vSnap.forEach(d => {
        batch.update(doc(db, 'vehicles', d.id), { clientId: currentUid });
      });

      // Update Work Orders
      const osQuery = query(collection(db, 'workOrders'), where('clientId', '==', oldProfile.id));
      const osSnap = await getDocs(osQuery);
      osSnap.forEach(d => {
        batch.update(doc(db, 'workOrders', d.id), { clientId: currentUid });
      });

      // Delete old profile
      batch.delete(doc(db, 'users', oldProfile.id));
    }

    // Update current profile with recovered points
    if (totalPoints > 0) {
      batch.set(doc(db, 'users', currentUid), { 
        points: increment(totalPoints),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // Update the CPF lookup to point to the NEW UID if we have a CPF
    if (normalizedCpf) {
      batch.set(doc(db, 'cpf_lookup', normalizedCpf), {
        uid: currentUid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();
    console.log(`[AutoRecover] Sync successful. Points recovered: ${totalPoints}`);
    return true;
  } catch (error) {
    console.error("[AutoRecover] Sync error:", error);
    if (error instanceof Error && error.message.includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, 'multiple/sync');
    }
    return false;
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    return null;
  }
}

export async function getClientWorkOrders(clientId: string): Promise<WorkOrder[]> {
  const path = 'workOrders';
  try {
    const q = query(collection(db, path), where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkOrder));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getSystemConfig() {
  try {
    const docRef = doc(db, 'system', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data();
    return {
      logoUrl: '',
      shopName: 'Mecânica Rota 435',
      whatsappTemplate: 'Olá {{name}}, faz {{time}} que você realizou o serviço de {{service}} no seu veículo {{vehicle}} (Placa {{plate}}). Passando para lembrar que pode ser o momento de uma nova revisão na {{shop}}! Como está o desempenho do carro?'
    };
  } catch (err) {
    console.error("Error getting system config:", err);
    return {
      logoUrl: '',
      shopName: 'Mecânica Rota 435'
    };
  }
}

export async function sendPushNotification(userIds: string[], title: string, body: string, data?: any) {
  try {
    const tokens: string[] = [];
    for (const uid of userIds) {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens);
        }
      }
    }

    if (tokens.length === 0) {
      console.log("[Push] Nenhum dispositivo cadastrado para os usuários:", userIds);
      return;
    }

    const response = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens, title, body, data })
    });

    return await response.json();
  } catch (err) {
    console.warn("[Push] Falha ao enviar notificação (Servidor pode estar offline durante build):", err);
  }
}
