import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth, messaging } from "../lib/firebase";

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("Notificação permitida.");
      await saveTokenToUser();
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erro ao solicitar permissão de notificação:", error);
    return false;
  }
}

async function saveTokenToUser() {
  const user = auth.currentUser;
  if (!user || !messaging) return;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log("FCM Token:", token);
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token)
      });
    }
  } catch (error) {
    console.error("Erro ao salvar token FCM:", error);
  }
}

export function onMessageListener() {
  if (!messaging) return;
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
}
