const CLIENT_ID = import.meta.env.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = window.location.origin + "/";
const SCOPES = "playlist-read-private playlist-read-collaborative";

const TOKEN_KEY = "sp_access_token";
const REFRESH_KEY = "sp_refresh_token";
const EXPIRES_KEY = "sp_expires_at";
const VERIFIER_KEY = "sp_code_verifier";

function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function saveTokens(data) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(
    EXPIRES_KEY,
    String(Date.now() + data.expires_in * 1000),
  );
}

export function logoutSpotify() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export async function loginWithSpotify() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: await sha256(verifier),
    scope: SCOPES,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error_description || data.error || "Error de Spotify");
  saveTokens(data);
  return data.access_token;
}

// Llamar al montar la app: si volvemos del login de Spotify, canjea el code.
export async function handleSpotifyRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) return null;
  window.history.replaceState({}, "", REDIRECT_URI);
  if (error) throw new Error(`Spotify: ${error}`);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier)
    throw new Error("Falta el code_verifier de Spotify, intenta de nuevo");
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
}

export async function getSpotifyToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expires = Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if (token && Date.now() < expires - 60_000) return token;
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    return await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refresh,
    });
  } catch {
    logoutSpotify();
    return null;
  }
}

export function extractPlaylistId(input) {
  const value = input.trim().replace(/[\u200B-\u200F\uFEFF]/g, "");
  const match =
    value.match(/spotify:playlist:([a-zA-Z0-9]+)/i) ||
    value.match(/\/playlist\/([a-zA-Z0-9]+)/i);
  if (match) return match[1];
  return /^[a-zA-Z0-9]{22}$/.test(value) ? value : null;
}

async function spotifyFetch(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const data = JSON.parse(text);
      msg =
        data.error?.message ||
        data.message ||
        data.error_description ||
        (typeof data.error === "string" ? data.error : text);
    } catch {}
    throw new Error(msg || `Spotify error ${res.status}`);
  }
  return JSON.parse(text);
}

async function api(token, path) {
  return spotifyFetch(token, `https://api.spotify.com/v1${path}`);
}

export async function fetchPlaylist(token, playlistId) {
  const meta = await api(
    token,
    `/playlists/${playlistId}?fields=name,external_urls.spotify,owner(display_name)`,
  );
  const tracks = [];
  let next = `/playlists/${playlistId}/items?limit=100&fields=items(item(id,name,type,is_local,artists(name),duration_ms)),next`;
  while (next) {
    const page = next.startsWith("http")
      ? await spotifyFetch(token, next)
      : await api(token, next);
    for (const { item } of page.items || []) {
      if (!item || item.type !== "track") continue;
      tracks.push({
        key: item.id || `local-${tracks.length}`,
        name: item.name,
        artists: (item.artists || []).map((a) => a.name),
        isLocal: item.is_local,
      });
    }
    next = page.next;
  }
  return { name: meta.name, spotifyUrl: meta.external_urls?.spotify, tracks };
}
