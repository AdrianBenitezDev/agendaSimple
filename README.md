# Rockeala

Proyecto Firebase activo para Rockeala, con web publica y panel admin ya desplegados.

Estado actual:

- proyecto Firebase real: `rockeala`
- region principal: `southamerica-east1`
- Firestore nativo creado
- Hosting multisite desplegado
- Cloud Functions v2 desplegadas
- frontend publico y admin apuntando al proyecto real

URLs activas:

- web publica: `https://rockeala.web.app`
- panel admin: `https://rockeala-admin.web.app`
- healthcheck: `https://southamerica-east1-rockeala.cloudfunctions.net/healthcheck`

Implementado en el repo:

- propuesta tecnica inicial en `docs/propuesta-tecnica.md`
- separacion entre web publica y panel admin
- configuracion real de Firebase en `apps/public-web/public/firebase-config.js` y `apps/admin-web/public/firebase-config.js`
- cache IndexedDB para el catalogo publico
- solicitud de turnos por Callable Function
- login Google y CRUD base para servicios, clientes, stock y productos
- seed demo en `functions/seed/demo-data.json`

Rutas utiles:

- `index.html`: hub local del proyecto
- `apps/public-web/public/index.html`: web publica
- `apps/admin-web/public/index.html`: panel administrador
- `docs/firebase-checklist.md`: checklist actualizado y seed demo

## Lo que falta

1. Habilitar `Google` en Firebase Authentication si todavia no lo hiciste.
2. Crear los documentos `admins/{uid}` en Firestore para cada profesional habilitado.
3. Entrar una vez al panel admin para obtener cada `uid` real de Google si aun no los tienes.
4. Inicializar Firebase Storage desde la consola si vas a usar archivos o imagenes.

Cada documento `admins/{uid}` deberia incluir al menos:

- `displayName`
- `businessName`
- `area`
- `publicArea`
- `active: true`
- `publicBookingEnabled: true`
- `timezone: "America/Argentina/Buenos_Aires"`

## Desarrollo

- instalar dependencias de Functions: `npm install` dentro de `functions/`
- correr emuladores: `firebase emulators:start`
- desplegar: `firebase deploy`

## Siguiente avance recomendado

1. Dar de alta los `admins/{uid}` reales.
2. Cargar datos iniciales reales o demo.
3. Conectar dominios `rockeala.com.ar` y `admin.rockeala.com.ar`.
4. Si se van a subir archivos, terminar Firebase Storage y desplegar `storage.rules`.
