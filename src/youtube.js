const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/youtube';

let gisPromise;

export function loadGoogleScript() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisPromise;
}

export async function requestYouTubeToken(prompt = 'consent') {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt });
  });
}

async function yt(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `YouTube error ${res.status}`);
  return data;
}

export function searchVideos(token, query) {
  return yt(
    token,
    `/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`
  );
}

export function createPlaylist(token, title, description) {
  return yt(token, '/playlists?part=snippet,status', {
    method: 'POST',
    body: {
      snippet: { title, description },
      status: { privacyStatus: 'private' },
    },
  });
}

export function addToPlaylist(token, playlistId, videoId) {
  return yt(token, '/playlistItems?part=snippet', {
    method: 'POST',
    body: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
}
