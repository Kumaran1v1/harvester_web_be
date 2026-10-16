import { initializeApp, cert, getApps, getApp, App } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import path from "path";
import fs from "fs";

let firebaseApp: App | null = null;

export function initializeFirebaseAdmin(): App | null {
  if (firebaseApp) return firebaseApp;

  try {
    const serviceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "firebase-service-account.json");

    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[Firebase Admin] Initialized with service account file:", serviceAccountPath);
      return firebaseApp;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[Firebase Admin] Initialized with inline JSON credentials");
      return firebaseApp;
    }

    const apps = getApps();
    if (apps.length > 0) {
      firebaseApp = apps[0];
      return firebaseApp;
    }

    console.warn(
      "[Firebase Admin] No service account credentials found. Push notifications will be simulated until firebase-service-account.json is provided."
    );
    return null;
  } catch (error) {
    console.error("[Firebase Admin] Initialization failed:", error);
    return null;
  }
}

export function getFirebaseMessaging(): Messaging | null {
  const app = initializeFirebaseAdmin();
  return app ? getMessaging(app) : null;
}
