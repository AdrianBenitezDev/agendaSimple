# Checklist Firebase - Rockeala

## Estado real del proyecto

- proyecto Firebase creado: `rockeala`
- plan Blaze activo
- region elegida: `southamerica-east1`
- Firestore `(default)` creado
- apps web creadas y conectadas al frontend
- Hosting multisite desplegado
- Cloud Functions v2 desplegadas
- reglas e indices de Firestore aplicados

URLs actuales:

- `https://rockeala.web.app`
- `https://rockeala-admin.web.app`
- `https://southamerica-east1-rockeala.cloudfunctions.net/healthcheck`

## Lo que ya quedo automatizado en el repo

- estructura multisite de Hosting en `firebase.json`
- reglas e indices de Firestore
- Functions base para solicitudes de turno
- seed demo para Firestore en `functions/seed/demo-data.json`
- script de carga en `functions/scripts/seed-firestore.js`
- configuracion real de Firebase en ambos frontends

## Lo que si necesitas hacer manualmente

### 1. Habilitar Authentication con Google

En Firebase Console:

1. Authentication
2. Sign-in method
3. Habilitar `Google`

Sin esto el panel admin no puede iniciar sesion.

### 2. Dar de alta admins

Aqui hay un paso manual inevitable porque cada admin necesita su `uid` real de Google.

Flujo recomendado:

1. Abre `https://rockeala-admin.web.app`.
3. Inicia sesion con Google.
4. Si tu `uid` todavia no existe, el panel te lo mostrara en pantalla.
5. Crea manualmente `admins/{uid}` en Firestore con estos campos minimos:

```json
{
  "displayName": "Peluqueria Natalia",
  "businessName": "Rockeala Peluqueria Natalia",
  "area": "Peluqueria Natalia",
  "publicArea": "Peluqueria",
  "email": "natalia@tudominio.com",
  "active": true,
  "publicBookingEnabled": true,
  "timezone": "America/Argentina/Buenos_Aires",
  "slug": "natalia"
}
```

Repite eso para:

- Manicura
- Depilacion
- Peluqueria Natalia
- Peluqueria Raul

### 3. Inicializar Firebase Storage

Sigue faltando este paso para poder desplegar `storage.rules` y usar archivos o imagenes.

En Firebase Console:

1. Storage
2. Click en `Get Started`
3. Mantener la misma region si es posible

Intentar `firebase deploy --only storage` hoy devuelve que el default bucket aun no existe.

## Seed demo

### Emulador

1. Levanta emuladores:

```powershell
firebase emulators:start --only firestore,functions,hosting
```

2. En otra terminal:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
npm run seed:demo
```

Ejecutar `npm run seed:demo` desde la carpeta `functions`.

### Proyecto real

Solo cuando quieras cargar demo data en el proyecto real y tengas credenciales locales:

```powershell
$env:GOOGLE_CLOUD_PROJECT="rockeala"
$env:ROCKEALA_SEED_ALLOW_PROD="true"
npm run seed:demo
```

## Recomendacion practica

Estado actual:

- proyecto `rockeala` creado
- Firestore creado en `southamerica-east1`
- Functions desplegadas
- Hosting desplegado y respondiendo
- configs Firebase escritas en el frontend

Bloqueos actuales:

- necesitas habilitar Google Sign-In desde Firebase Console
- necesitas crear `admins/{uid}` reales
- necesitas inicializar Firebase Storage si vas a usar uploads

Cuando eso este, yo puedo seguir con:

- desplegar `storage.rules`
- preparar una carga inicial orientada a tus admins reales
- dejar dominios y seed final cerrados
