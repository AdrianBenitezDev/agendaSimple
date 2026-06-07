# Propuesta tecnica inicial - Rockeala

## Objetivo de esta fase

Dejar una base clara, escalable y facil de mantener antes de entrar en la implementacion completa. La idea es separar desde el inicio:

- web publica para clientes
- panel administrador
- backend y reglas de seguridad
- modelo de datos compartido con espacio para necesidades particulares

## Stack recomendado

- Firebase Hosting multisite
- Firebase Authentication con Google para administradores
- Firestore para catalogo, clientes, turnos, stock, pagos y configuraciones
- Firebase Functions para validaciones sensibles y solicitudes publicas de turnos
- cache local en la web publica y evolucion a IndexedDB cuando el catalogo crezca
- HTML/CSS/JS en esta etapa para validar estructura y experiencia sin forzar framework demasiado pronto

## Estructura de carpetas propuesta

```text
rockeala/
|-- apps/
|   |-- public-web/
|   |   `-- public/
|   |       |-- index.html
|   |       |-- styles.css
|   |       `-- app.js
|   `-- admin-web/
|       `-- public/
|           |-- index.html
|           |-- styles.css
|           `-- app.js
|-- docs/
|   `-- propuesta-tecnica.md
|-- functions/
|   |-- package.json
|   `-- src/
|       `-- index.js
|-- .firebaserc
|-- firebase.json
|-- firestore.indexes.json
|-- firestore.rules
|-- storage.rules
|-- index.html
`-- README.md
```

## Separacion entre web publica y admin

### `apps/public-web/public`

Sirve el sitio de clientes en `rockeala.com.ar`. Sus responsabilidades:

- presentar marca, servicios y precios
- leer solo datos publicos del catalogo
- cargar rapido usando cache local
- solicitar turnos sin exponer escrituras directas a Firestore

### `apps/admin-web/public`

Sirve el panel en `admin.rockeala.com.ar`. Sus responsabilidades:

- login con Google
- identificar al administrador segun `request.auth.uid`
- mostrar solo su panel, servicios, turnos, clientes, stock y pagos
- administrar duraciones estimadas y horarios

### `functions`

Centraliza lo sensible:

- solicitud publica de turnos
- validaciones de negocio
- sincronizacion futura de claims o permisos
- integraciones futuras de notificaciones o recordatorios

## Modelo recomendado de Firestore

### Colecciones compartidas

#### `admins/{adminId}`

Documento semilla para cada administrador autenticado.

Campos sugeridos:

- `displayName`
- `email`
- `area`
- `businessName`
- `active`
- `timezone`
- `publicBookingEnabled`

Admins iniciales:

- manicura
- depilacion
- peluqueria natalia
- peluqueria raul

#### `servicios/{serviceId}`

Catalogo administrable por cada negocio.

Campos sugeridos:

- `adminId`
- `area`
- `name`
- `description`
- `price`
- `currency`
- `durationMinutes`
- `publicVisible`
- `sortOrder`
- `updatedAt`

Servicios iniciales recomendados:

- corte: `20`
- tintura: `60`

#### `turnos/{appointmentId}`

Agenda operativa. Conviene manejar `status` para evitar borrados innecesarios.

Campos sugeridos:

- `adminId`
- `clientId`
- `serviceId`
- `serviceNameSnapshot`
- `requestedStartAt`
- `estimatedDurationMinutes`
- `status`
- `source`
- `notes`
- `createdAt`
- `updatedAt`

Estados sugeridos:

- `pending`
- `confirmed`
- `completed`
- `cancelled`

#### `clientes/{clientId}`

Coleccion general, como pediste, pero con pertenencia controlada por administrador.

Campos sugeridos:

- `adminIds`
- `fullName`
- `phone`
- `email`
- `birthday`
- `notes`
- `lastVisitAt`
- `createdAt`
- `updatedAt`

#### `clientes/{clientId}/perfilesAdmin/{adminId}`

Subdocumento para diferencias de negocio sin romper la coleccion general.

Ejemplo para **Peluqueria Natalia**:

- `colorActual`
- `ultimoTratamiento`
- `cambioColor`
- `volumenAguaOxigenada`
- `mechas`
- `tratamientosConFormol`
- `updatedAt`

#### `clientes/{clientId}/perfilesAdmin/{adminId}/tratamientos/{treatmentId}`

Historial fechable para cada tratamiento.

Campos sugeridos:

- `type`
- `detail`
- `date`
- `notes`

#### `stock/{stockId}`

Coleccion compartida con control por `adminId`, como pediste.

Campos sugeridos:

- `adminId`
- `name`
- `quantity`
- `price`
- `brand`
- `category`
- `createdAt`
- `updatedAt`

#### `productos/{productId}`

Productos para venta o reventa.

Campos sugeridos:

- `adminId`
- `name`
- `price`
- `brand`
- `category`
- `quantity`
- `updatedAt`

#### `pagos/{paymentId}`

Registro financiero minimo por turno o venta.

Campos sugeridos:

- `adminId`
- `appointmentId`
- `clientId`
- `amount`
- `method`
- `status`
- `createdAt`

### Subcolecciones por admin para configuracion

- `admins/{adminId}/config/general`
- `admins/{adminId}/availability/defaultWeek`
- `admins/{adminId}/catalogSettings/publicDisplay`

Esto deja espacio para que cada administrador tenga reglas o campos particulares sin forzar una sola estructura monolitica.

## Reglas basicas de seguridad

La base creada en `firestore.rules` responde a cuatro ideas:

1. El sitio publico solo puede leer servicios marcados como visibles.
2. Los turnos publicos no se escriben directo desde la web publica; pasan por Functions.
3. Cada admin solo accede a sus documentos mediante `adminId` o inclusion en `adminIds`.
4. El documento `admins/{uid}` actua como lista blanca de acceso real al panel.

## Flujo de autenticacion recomendado

1. El admin entra a `admin.rockeala.com.ar`.
2. Firebase Auth inicia sesion con Google.
3. El frontend consulta `admins/{uid}`.
4. Si el documento existe y `active == true`, se carga su panel.
5. Si no existe, se rechaza acceso y se muestra mensaje de cuenta no habilitada.

Recomendacion:

- usar el `uid` de Google como `adminId`
- sembrar la coleccion `admins` manualmente o desde una funcion privada
- agregar custom claims mas adelante si el panel crece o si necesitas permisos internos

## Flujo para cargar servicios y precios

1. La web publica renderiza primero un cache local.
2. En segundo plano consulta Firestore sobre `servicios` con `publicVisible == true`.
3. Ordena por `area` y `sortOrder`.
4. Actualiza la UI silenciosamente.
5. Guarda la respuesta en cache local o IndexedDB.
6. Muestra una marca de "actualizado" sin interrumpir la navegacion.

En esta base deje el preview con cache simple en `localStorage`. Cuando pases a datos reales, conviene mover ese cache a IndexedDB si el catalogo empieza a crecer o si agregas imagenes, promociones o historial de sincronizacion.

## Flujo para solicitar turnos

1. El cliente elige area, servicio y horario.
2. La web publica aclara que la duracion es estimada.
3. La solicitud va a `submitAppointmentRequest` en Functions.
4. La funcion valida:
   - admin habilitado
   - servicio existente
   - martes a sabado
   - entre 10:00 y 20:00
   - duracion estimada vigente del servicio
5. La funcion crea o actualiza el cliente en `clientes`.
6. La funcion crea un turno en `turnos` con estado `pending`.
7. El panel del admin confirma, reprograma o rechaza.

## Diseno inicial de `index.html`

La propuesta visual base ya esta en `apps/public-web/public/index.html`.

Lineamientos:

- hero editorial y calido
- categorias claras: peluqueria, depilacion, manicura
- bloque de precios visible sin obligar a navegar demasiado
- panel de solicitud de turnos con horario operativo fijo
- aclaracion de duracion estimada
- footer con datos de contacto y estado del catalogo

## Diseno inicial del panel administrador

La propuesta base esta en `apps/admin-web/public/index.html`.

Modulos iniciales:

- resumen del dia
- proximos turnos
- servicios y precios
- clientes
- stock y alertas
- pagos
- ajustes del negocio

La idea es que el panel sea comun en estructura, pero con contenido y configuraciones diferentes segun el admin logueado.

## Recomendaciones para Hosting y dominios

Segun la documentacion oficial de Firebase Hosting multisite, esta separacion es la correcta:

- un sitio Hosting para `rockeala.com.ar`
- otro sitio Hosting para `admin.rockeala.com.ar`
- ambos dentro del mismo proyecto Firebase de produccion `rockeala`

Secuencia sugerida:

1. Crear el proyecto Firebase `rockeala`.
2. Crear dos sites de Hosting.
3. Aplicar targets:
   - `firebase target:apply hosting publicWeb <site-publico>`
   - `firebase target:apply hosting adminWeb <site-admin>`
4. Conectar los dominios personalizados en la consola:
   - `rockeala.com.ar`
   - `admin.rockeala.com.ar`
5. Mantener ambientes separados con otro proyecto para desarrollo cuando empieces a mover datos reales.

## Orden de implementacion recomendado

1. Crear proyecto Firebase y sites de Hosting.
2. Cargar admins iniciales y probar login Google.
3. Conectar `servicios` reales a la web publica.
4. Implementar persistencia real de `turnos` y `clientes` en Functions.
5. Construir panel de administracion por modulos.
6. Agregar alertas, reportes y stock avanzado.

## Referencias oficiales consultadas

- Firebase Hosting multisite: https://firebase.google.com/docs/hosting/multisites
- Firebase custom domains: https://firebase.google.com/docs/hosting/custom-domain
- Firebase Auth con Google en web: https://firebase.google.com/docs/auth/web/google-signin
- Cloud Functions for Firebase: https://firebase.google.com/docs/functions/get-started
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
