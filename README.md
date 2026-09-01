# V-Trading Platform

Plataforma de trading simulado con dashboard en tiempo real, gestión de usuarios y panel administrativo.

## ⚙️ Configuración inicial

### 1. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/vtrading.git
cd vtrading
```

### 2. Crear el archivo de configuración
Copia la plantilla y llénala con tus credenciales de Firebase:
```bash
cp config.example.js config.js
```
Luego edita `config.js` con tus datos reales de Firebase.

### 3. Configurar Firebase
1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Crea un proyecto o usa uno existente
3. Copia las credenciales en `config.js`

### 4. Restringir tu API Key (MUY IMPORTANTE)
Para evitar que otros usen tu API key:
1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Navega a **APIs & Services → Credentials**
3. Edita tu API key → **Application restrictions**
4. Selecciona **"HTTP referrers (websites)"**
5. Agrega **solo tu dominio**: `https://tusitio.com/*`

### 5. Reglas de Firestore
En Firebase Console → Firestore → Rules, usa estas reglas mínimas:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /vtrading/{document} {
      allow read, write: if true; // Ajusta según tus necesidades
    }
  }
}
```

## 🔒 Seguridad

- El archivo `config.js` está en `.gitignore` y **nunca se sube a GitHub**
- La API key está restringida por dominio en Google Cloud Console
- Las reglas de Firestore controlan el acceso a la base de datos

## 🚀 Ejecutar localmente
Abre `index.html` directamente en tu navegador o usa un servidor local:
```bash
npx serve .
```
