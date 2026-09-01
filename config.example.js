// ══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE FIREBASE — V-Trading (PLANTILLA PARA GITHUB)
//
// ⚠️  Copia este archivo como "config.js" y llena con tus valores reales.
//     El archivo "config.js" real está en .gitignore y NUNCA se sube.
//
// Este proyecto usa Firebase Authentication (Email/Contraseña) + Firestore.
// Pasos de seguridad OBLIGATORIOS:
// 1. Obtén tus credenciales en: https://console.firebase.google.com
// 2. Habilita el proveedor "Email/Password" en Authentication > Sign-in method
// 3. Restringe tu API key en: https://console.cloud.google.com
//    → APIs & Services → Credentials → Editar API key
//    → HTTP referrers → agrega solo TU dominio
// ══════════════════════════════════════════════════════════════════

window.__VT_CFG = {
  apiKey: "REEMPLAZA_CON_TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_MESSAGING_ID",
  appId: "TU_APP_ID"
};
