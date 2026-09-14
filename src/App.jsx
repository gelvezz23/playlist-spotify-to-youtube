import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  loginWithSpotify,
  handleSpotifyRedirect,
  getSpotifyToken,
  extractPlaylistId,
  fetchPlaylist,
  logoutSpotify,
} from "./spotify";
import {
  requestYouTubeToken,
  searchVideos,
  createPlaylist,
  addToPlaylist,
} from "./youtube";
import { bestMatch } from "./matching";

const SPOTIFY_ID = import.meta.env.SPOTIFY_CLIENT_ID;
const GOOGLE_ID = import.meta.env.GOOGLE_CLIENT_ID;

const STATUS = {
  pending: { label: "Pendiente", cls: "pending" },
  searching: { label: "Buscando…", cls: "searching" },
  added: { label: "Añadida", cls: "added" },
  notfound: { label: "No encontrada", cls: "notfound" },
  skipped: { label: "Archivo local", cls: "notfound" },
  error: { label: "Error", cls: "notfound" },
};

export default function App() {
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [googleToken, setGoogleToken] = useState(null);
  const [url, setUrl] = useState("");
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [phase, setPhase] = useState("idle"); // idle | loading | loaded | converting | done
  const [error, setError] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    handleSpotifyRedirect()
      .then((t) => t && setSpotifyOn(true))
      .catch((e) => setError(e.message))
      .finally(() => getSpotifyToken().then((t) => setSpotifyOn(Boolean(t))));
  }, []);

  const updateTrack = (key, patch) =>
    setTracks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  async function loadPlaylist() {
    setError("");
    const id = extractPlaylistId(url);
    if (!id)
      return setError("Esa URL no parece una playlist de Spotify válida.");
    const token = await getSpotifyToken();
    if (!token) return setError("Conecta tu cuenta de Spotify primero.");
    setPhase("loading");
    setPlaylist(null);
    setTracks([]);
    setYtUrl("");
    try {
      const data = await fetchPlaylist(token, id);
      setPlaylist(data);
      setTracks(data.tracks.map((t) => ({ ...t, status: "pending" })));
      setPhase("loaded");
    } catch (e) {
      setError(e.message);
      setPhase("idle");
    }
  }

  async function convert() {
    setError("");
    let token = googleToken;
    if (!token) {
      try {
        token = await requestYouTubeToken();
        setGoogleToken(token);
      } catch (e) {
        return setError(`Google: ${e.message}`);
      }
    }
    setPhase("converting");
    cancelRef.current = false;
    try {
      const created = await createPlaylist(
        token,
        `${playlist.name} (desde Spotify)`,
        "Importada desde Spotify",
      );
      const playlistId = created.id;
      setYtUrl(`https://www.youtube.com/playlist?list=${playlistId}`);
      for (const track of tracks) {
        if (cancelRef.current) break;
        if (track.isLocal) {
          updateTrack(track.key, {
            status: "skipped",
            note: "No está en Spotify/YouTube",
          });
          continue;
        }
        updateTrack(track.key, { status: "searching" });
        try {
          const query = `${track.artists.join(" ")} ${track.name}`;
          const res = await searchVideos(token, query);
          const { item, confident } = bestMatch(track, res.items);
          if (!item || !confident) {
            updateTrack(track.key, {
              status: "notfound",
              note: item
                ? `Más cercano: ${item.snippet.title}`
                : "Sin resultados",
            });
            continue;
          }
          await addToPlaylist(token, playlistId, item.id.videoId);
          updateTrack(track.key, {
            status: "added",
            videoTitle: item.snippet.title,
          });
        } catch (e) {
          updateTrack(track.key, { status: "error", note: e.message });
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      setPhase("done");
    } catch (e) {
      setError(e.message);
      setPhase("loaded");
    }
  }

  const added = tracks.filter((t) => t.status === "added").length;
  const failed = tracks.filter((t) =>
    ["notfound", "skipped", "error"].includes(t.status),
  );

  return (
    <main className="app">
      <h1>Spotify → YouTube</h1>
      <p className="sub">
        Convierte una playlist de Spotify en una playlist de YouTube.
      </p>

      {(!SPOTIFY_ID || !GOOGLE_ID) && (
        <div className="banner">
          Falta configurar <code>.env</code>: copia <code>.env.example</code> a{" "}
          <code>.env</code> y pon tu <code>SPOTIFY_CLIENT_ID</code> y{" "}
          <code>GOOGLE_CLIENT_ID</code>. Revisa el README.
        </div>
      )}

      <section className="card auth">
        <div>
          {spotifyOn ? (
            <span className="ok">Spotify conectado</span>
          ) : (
            <button onClick={loginWithSpotify} disabled={!SPOTIFY_ID}>
              Conectar Spotify
            </button>
          )}
          {spotifyOn && (
            <button
              className="link"
              onClick={() => {
                logoutSpotify();
                setSpotifyOn(false);
              }}
            >
              desconectar
            </button>
          )}
        </div>
        <div>
          {googleToken ? (
            <span className="ok">YouTube conectado</span>
          ) : (
            <button
              onClick={() =>
                requestYouTubeToken()
                  .then(setGoogleToken)
                  .catch((e) => setError(e.message))
              }
              disabled={!GOOGLE_ID}
            >
              Conectar YouTube
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <label htmlFor="url">URL de la playlist de Spotify</label>
        <div className="row">
          <input
            id="url"
            type="text"
            placeholder="https://open.spotify.com/playlist/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
          />
          <button
            onClick={loadPlaylist}
            disabled={!spotifyOn || phase === "loading"}
          >
            {phase === "loading" ? "Cargando…" : "Cargar"}
          </button>
        </div>
      </section>

      {error && <div className="banner error">{error}</div>}

      {playlist && (
        <section className="card">
          <h2>{playlist.name}</h2>
          <p>{tracks.length} canciones</p>
          <div className="row">
            {phase === "converting" ? (
              <button onClick={() => (cancelRef.current = true)}>
                Cancelar
              </button>
            ) : (
              <button
                className="primary"
                onClick={convert}
                disabled={phase === "done"}
              >
                {phase === "done" ? "Convertida" : "Convertir a YouTube"}
              </button>
            )}
            {ytUrl && (
              <a
                href={ytUrl}
                target="_blank"
                rel="noreferrer"
                className="ytlink"
              >
                Abrir playlist en YouTube
              </a>
            )}
          </div>
          {(phase === "converting" || phase === "done") && (
            <p className="summary">
              {added} añadidas · {failed.length} no encontradas
            </p>
          )}
          <ul className="tracks">
            {tracks.map((t) => (
              <li key={t.key} className={STATUS[t.status]?.cls}>
                <span className="dot" />
                <span className="name">
                  {t.name}
                  <span className="artist"> — {t.artists.join(", ")}</span>
                </span>
                <span className="status">{STATUS[t.status]?.label}</span>
                {t.videoTitle && <span className="note">→ {t.videoTitle}</span>}
                {t.note && <span className="note">{t.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
