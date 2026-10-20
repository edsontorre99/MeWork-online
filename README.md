# TORAM HUB – Plataforma de Operaciones

Aplicación web (Next.js App Router + TypeScript + Tailwind) para centralizar la operación de marketing:
planificador semanal con IA, agentes de Gemini, estadísticas de Tayau, boletos con QR y Recursos Humanos.

## Arranque rápido

Primero pon en `.env` la `DATABASE_URL` de una base MySQL (por ejemplo la de pruebas `mework_dev` de Hostinger,
con **MySQL remoto** activado para tu IP). Luego:

```bash
npm install
npx prisma db push
npm run dev
```

Abre http://localhost:3000 e inicia sesión con el usuario y contraseña definidos en `.env`
(`AUTH_USER` / `AUTH_PASSWORD`). La primera vez se cargan datos de ejemplo (herramientas, agentes, tareas,
semanas de Tayau e ideas de TikTok).

Después ve a **Ajustes** y pega tu API Key de Gemini (https://aistudio.google.com/apikey).

## Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | MySQL: `mysql://USUARIO:CONTRASEÑA@HOST:3306/NOMBRE_BASE` (símbolos de la contraseña codificados: `#` → `%23`, `@` → `%40`, `/` → `%2F`) |
| `AUTH_USER`, `AUTH_PASSWORD` | Credenciales de acceso |
| `JWT_SECRET` | Firma de la cookie de sesión (cámbialo en producción) |
| `GEMINI_API_KEY` | Opcional; la llave guardada en Ajustes tiene prioridad |
| `MAIL_ENCRYPTION_KEY` | Cifra las contraseñas de aplicación de Gmail. **No la cambies ni la pierdas**: si cambia, hay que reconectar las cuentas |
| `CRON_SECRET` | Protege `/api/cron/revisar-correo` (encabezado `Authorization: Bearer <secreto>`) |

## Módulos

- **Login** (`/`): cookie httpOnly con JWT firmado, 7 días. `middleware.ts` protege todas las rutas.
- **Dashboard** (`/dashboard`): saludo y 3 prioridades del día, *AI Smart Weekly Planner* (Gemini reparte el
  brain dump de lunes a domingo; arrastrar y soltar con mouse o dedo), equipo remoto, Tayau Stats, TikTok y boletos.
- **Barra lateral**: herramientas editables con el menú `⋮` (nombre y URL), buscador de Google en modal,
  proyectos (filtran el planner) y “Nuevo proyecto”.
- **Agentes de IA**: cada agente tiene su system prompt y su propia memoria (tabla `Message`). Valeria redacta
  correos como borrador editable y los envía desde tus cuentas de Gmail solo cuando tú los apruebas
  (ver “Conectar Gmail”).
- **Tayau**: “Agregar métricas” → calendario del mes actual → semana de 7 días → subir hasta 100 fotos de
  encuestas. Gemini lee cada una, promedia comida, ambiente y servicio y cuenta cómo nos encontraron
  (Facebook, Instagram, recomendación, TikTok/Maps u otros). Revisas el resumen y lo guardas.
- **Boletos**: código único por boleto, QR descargable, cobro con OpenPay (cargo con redireccionamiento, requiere
  Merchant ID + llave privada en Ajustes) o marcado manual, y validador de entrada Permitido/Denegado
  (con cámara en navegadores que soportan `BarcodeDetector`).
- **Recursos Humanos** (`/recursos-humanos`): ver/editar/dar de baja agentes, “Contratar” manual y el
  *Reclutador de Talento Inteligente*, que analiza tareas y propone fichas listas para contratar en un clic.

## Conectar Gmail

Con esto Valeria puede enviar correos desde tus cuentas (siempre con tu aprobación) y avisarte cuando te
respondan o llegue algo importante. No necesitas Google Cloud ni nada técnico: solo una
**contraseña de aplicación**, que es una clave especial de 16 letras que Google te da para una sola app.

### Antes de empezar
- Ten a la mano tu celular (Google te puede pedir confirmar que eres tú).
- Repite estos pasos con cada cuenta que quieras conectar (por ejemplo Toram, Personal y Negocio).

### Paso a paso
1. Abre MeWork y entra a **Ajustes** (barra lateral).
2. Baja hasta **Cuentas de correo** y da clic en **Conectar cuenta de Gmail**.
3. **Paso 1 – Tu cuenta:** elige un nombre (Toram, Personal, Negocio o el que quieras) y escribe el correo de Gmail.
4. **Paso 2 – Verificación en 2 pasos:** da clic en **Abrir verificación en 2 pasos**. Se abre una página de Google;
   si dice que ya está activada, regresa a MeWork. Si no, actívala siguiendo las instrucciones de Google
   (normalmente con tu número de celular). Luego da clic en **Ya está activa**.
5. **Paso 3 – Contraseña de aplicación:** da clic en **Abrir contraseñas de aplicación**. En la página de Google:
   - Revisa que arriba a la derecha esté la cuenta correcta.
   - En “Nombre de la app” escribe **MeWork** y da clic en **Crear**.
   - Aparecen **16 letras** en un recuadro (por ejemplo `abcd efgh ijkl mnop`). Cópialas.
6. **Paso 4 – Conectar:** pega las 16 letras (con o sin espacios, da igual) y da clic en **Probar y conectar**.
   MeWork revisa que pueda leer y enviar correos; si todo sale bien, verás la cuenta como **Conectada**.

### Si algo sale mal
| Mensaje | Qué hacer |
|---|---|
| “Google rechazó la contraseña…” | Vuelve al paso 3, crea una contraseña nueva y cópiala completa (16 letras). |
| “Esa es tu contraseña normal de Google…” | No uses la contraseña con la que entras a Gmail; usa la de 16 letras del paso 3. |
| “No aparece la opción de contraseñas de aplicación” | Primero activa la verificación en 2 pasos (paso 2). En cuentas de empresa, el administrador debe permitirlo. |
| “Ese correo no es de Gmail…” | MeWork solo conecta cuentas de Gmail o de empresa con Google Workspace. |
| “No hay conexión con Gmail…” | Revisa tu internet y vuelve a intentar. |

### Cómo se usa
- **Enviar correos:** en el Dashboard abre el chat de Valeria y escríbele algo como
  *“escríbele a Juan de OpenPay que ya mandamos los documentos”*. Te mostrará un borrador: elige en
  **Enviar desde** la cuenta, corrige lo que quieras y da clic en **Aprobar y enviar** → **Sí, enviar**.
  Si no conoce el correo de la persona, lo busca en tus correos; si hay varias opciones te deja elegir.
  Nada se envía sin tu confirmación, y hay un límite de 30 envíos por hora.
- **Avisos:** cada 2 horas (puedes cambiarlo a 1 o 4 en Ajustes) MeWork revisa tus bandejas y te avisa en
  la **campanita “Avisos”** de la barra lateral cuando alguien responde a un correo enviado desde MeWork o
  llega algo importante (clientes, pagos, bancos, proveedores, citas, fechas límite, temas legales).
  No marca tus correos como leídos. También puedes dar clic en **Revisar ahora**.
- La revisión automática funciona **mientras MeWork esté encendido**. Si lo instalas en un servidor, programa
  una llamada a `/api/cron/revisar-correo` con el encabezado `Authorization: Bearer <CRON_SECRET>`.

### Seguridad
- Las contraseñas de aplicación se guardan **cifradas** (AES-256-GCM) con `MAIL_ENCRYPTION_KEY` y nunca se
  muestran en el navegador.
- Para quitarle el acceso a MeWork: en Ajustes da clic en **Desconectar**, y si quieres, borra la contraseña
  “MeWork” en https://myaccount.google.com/apppasswords.

## Publicar en Hostinger

### 1. Crea la base de datos
1. En hPanel entra a **Bases de datos → Administración de bases de datos MySQL**.
2. Crea una base (por ejemplo `mework`) con su usuario y contraseña. Anótalos.
3. Copia el **host** que aparece ahí (algo como `srv123.hstgr.io` o `localhost` si la app vive en el mismo servidor).
4. Arma tu `DATABASE_URL`:
   `mysql://USUARIO:CONTRASEÑA@HOST:3306/NOMBRE_BASE`
   Si la contraseña tiene símbolos, cámbialos: `#` → `%23`, `@` → `%40`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`, `&` → `%26`, `%` → `%25`.

Consejo: crea una segunda base `mework_dev` para trabajar desde tu computadora. En **MySQL remoto** agrega tu IP
para que te deje conectar.

### 2. Crea la app Node.js
1. En hPanel: **Sitios web → Agregar sitio web → Node.js Web App** y conéctala con tu repositorio de GitHub.
2. Versión de Node: **20 o 22**.
3. Comando de build: `npm run build`
4. Comando de inicio: `npm start`

### 3. Variables de entorno
Agrégalas en la configuración de la app (no subas tu `.env` a GitHub):

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | La cadena MySQL del paso 1 |
| `AUTH_USER` | Tu usuario para entrar a MeWork |
| `AUTH_PASSWORD` | Tu contraseña para entrar a MeWork |
| `JWT_SECRET` | Un texto largo y aleatorio |
| `GEMINI_API_KEY` | Tu API Key de Gemini (opcional si la guardas en Ajustes) |
| `MAIL_ENCRYPTION_KEY` | Solo si conectas Gmail; la misma de siempre |
| `CRON_SECRET` | Solo si programas la revisión de correo |

### 4. Despliega
Cada vez que publiques, `npm run build` crea o actualiza las tablas solo (`prisma db push`) y luego compila la app.
La primera vez que entres se cargan los datos de ejemplo.

Si el build se detiene con un aviso de que se perderían datos (por ejemplo, al quitar una columna), no se borró
nada: revisa el cambio antes de continuar.
