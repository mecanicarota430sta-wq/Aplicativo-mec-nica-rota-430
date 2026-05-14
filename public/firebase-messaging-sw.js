importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAAoWvBYOS27JrlSX7wMTOewV9LIk0Kb10",
  authDomain: "gen-lang-client-0817862812.firebaseapp.com",
  projectId: "gen-lang-client-0817862812",
  storageBucket: "gen-lang-client-0817862812.firebasestorage.app",
  messagingSenderId: "381328342333",
  appId: "1:381328342333:web:529da2bead6944b3e61954"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
