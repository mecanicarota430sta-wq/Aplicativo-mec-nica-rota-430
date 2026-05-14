import express from "express";
import path from "path";
// import { createServer as createViteServer } from "vite"; // Removed static import
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin"; // Still needed for FieldValue
import { initializeApp as initializeWebApp } from "firebase/app";
import { getFirestore as getWebFirestore, doc as webLibDoc, getDoc as getWebLibDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin Modularly
let adminDb: any = null;

function getDb() {
  if (adminDb) return adminDb;
  
  try {
    const apps = getAdminApps();
    let app;
    if (apps.length === 0) {
      app = initializeAdminApp({
        projectId: firebaseConfig.projectId,
      });
      console.log("Firebase Admin initialized for project:", firebaseConfig.projectId);
    } else {
      app = apps[0];
    }
    
    const databaseId = (firebaseConfig as any).firestoreDatabaseId;
    if (databaseId && databaseId !== '(default)') {
      adminDb = getAdminFirestore(app, databaseId);
      console.log("Firestore initialized with custom database:", databaseId);
    } else {
      adminDb = getAdminFirestore(app);
      console.log("Firestore initialized with default database");
    }
  } catch (e) {
    console.error("Firebase Admin initialization failed.", e);
  }
  return adminDb;
}

// Initialize Web SDK for public reads (fallback if Admin IAM fails)
const webApp = initializeWebApp(firebaseConfig);
const webDb = getWebFirestore(webApp, (firebaseConfig as any).firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Push Notifications
  app.post("/api/notify", async (req, res) => {
    getDb(); // Ensure Firebase Admin is initialized
    const { tokens, title, body, data } = req.body;

    if (!tokens || tokens.length === 0) {
      return res.status(400).json({ error: "No tokens provided" });
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data || {},
      });
      
      console.log(`Notifications sent: ${response.successCount} success, ${response.failureCount} failure`);
      res.json({ success: true, ...response });
    } catch (error) {
      console.error("Error sending push notifications:", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  // API Route for User Lookup by CPF
  app.post("/api/check-cpf", async (req, res) => {
    getDb(); // Ensure Firebase Admin is initialized
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ error: "CPF required" });

    const rawCpf = cpf.trim();
    const normalizedCpf = rawCpf.replace(/\D/g, "");

    console.log(`[API] Checking CPF: ${rawCpf} (normalized: ${normalizedCpf})`);

    try {
      if (!normalizedCpf) {
        return res.status(400).json({ error: "CPF invalid" });
      }

      // Use Web SDK for public lookup (it's open for public 'get' in rules)
      const lookupDoc = await getWebLibDoc(webLibDoc(webDb, 'cpf_lookup', normalizedCpf));
      
      if (lookupDoc.exists()) {
        const data = lookupDoc.data();
        console.log(`[API] Found user in lookup (Web SDK): ${data.uid} (${data.name})`);
        return res.json({ 
          exists: true, 
          email: data.email || "", 
          name: data.name || "",
          id: data.uid
        });
      }
      
      console.log(`[API] No record in lookup for CPF: ${normalizedCpf}`);
      res.json({ exists: false });
      
    } catch (error) {
      console.error("[API] Error checking CPF:", error);
      res.status(500).json({ error: "Search failed: " + (error instanceof Error ? error.message : "Unknown error") });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    console.log("[Dev] Starting with Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Determine distPath - explicitly use process.cwd() or similar if __dirname is tricky
    // But since server.cjs is in dist/, __dirname IS the dist folder.
    const distPath = path.resolve(__dirname);
    console.log(`[Production] Server directory (__dirname): ${distPath}`);
    const indexPath = path.join(distPath, 'index.html');
    console.log(`[Production] Expected index.html path: ${indexPath}`);
    
    // Serve static files (assets, etc)
    app.use(express.static(distPath, {
      maxAge: '1h', // Shorter cache during debug
      index: false
    }));

    app.get('*', (req, res) => {
      // Don't serve API routes as HTML
      if (req.path.startsWith('/api/')) return res.status(404).json({ error: "API route not found" });

      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Production] Failed to send index.html:`, err);
          res.status(500).send("Erro interno ou sistema em manutenção. Recarregue em instantes.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer().catch(err => {
  console.error("Critical error starting server:", err);
  process.exit(1);
});
