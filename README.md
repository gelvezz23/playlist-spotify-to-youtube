# Spotify → YouTube

App web (React + Vite) que convierte una playlist de Spotify en una playlist de YouTube.
Pegas la URL de la playlist, la app busca cada canción en YouTube, crea la playlist en tu
cuenta y te avisa cuáles canciones no encontró.

Todo corre en el navegador: no hay backend ni secretos en el código.

## Requisitos

Necesitas crear dos credenciales gratuitas (una vez):

### 1. Spotify — Client ID

1. Entra a https://developer.spotify.com/dashboard e inicia sesión.
2. **Create app** → pon cualquier nombre.
3. En **Redirect URIs** añade exactamente: `http://localhost:5173/`
4. Marca la API **Web API** y guarda.
5. Copia el **Client ID**.

### 2. Google — OAuth Client ID

1. Entra a https://console.cloud.google.com y crea un proyecto.
2. En **APIs y servicios → Biblioteca**, activa **YouTube Data API v3**.
3. En **Pantalla de consentimiento OAuth**: tipo **Externo**, rellena el nombre de la app
   y en **Usuarios de prueba** añade tu propio correo de Google.
4. En **Credenciales → Crear credenciales → ID de cliente de OAuth**: tipo
   **Aplicación web**, y en **Orígenes de JavaScript autorizados** añade
   `http://localhost:5173`.
5. Copia el **Client ID** (termina en `.apps.googleusercontent.com`).

### 3. Configurar la app

```bash
cp .env.example .env
```

Rellena `.env` con los dos client IDs.

## Uso

```bash
npm install
npm run dev
```

Abre **http://localhost:5173** (usa `localhost`, no `127.0.0.1`, para que coincida con
los redirect URIs).

1. **Conectar Spotify** y **Conectar YouTube** (ventanas de login de cada servicio).
2. Pega la URL de tu playlist de Spotify → **Cargar**.
3. **Convertir a YouTube** → se crea la playlist (privada) en tu cuenta y se van
   añadiendo las canciones. Las que no se encuentran quedan marcadas en rojo con el
   resultado más cercano, para que las revises a mano.

## Notas

- La playlist de YouTube se crea como **privada**; puedes hacerla pública desde YouTube.
- La cuota gratuita de YouTube Data API es 10.000 unidades/día. Cada búsqueda cuesta
  100, así que puedes convertir ~90 canciones al día con la cuota por defecto.
- Las canciones locales de Spotify (archivos subidos por ti) no existen en el catálogo
  y se marcan como "archivo local".
