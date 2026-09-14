export function normalize(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const JUNK = /\b(cover|karaoke|tribute|parodia|nightcore|sped up|slowed)\b/;

function scoreCandidate(track, item) {
  const haystack = normalize(`${item.snippet.title} ${item.snippet.channelTitle}`);
  const titleTokens = normalize(track.name).split(' ').filter((t) => t.length > 1);
  const artistTokens = normalize(track.artists[0] || '').split(' ').filter((t) => t.length > 1);

  const titleScore = titleTokens.length
    ? titleTokens.filter((t) => haystack.includes(t)).length / titleTokens.length
    : 0;
  const artistScore = artistTokens.length
    ? artistTokens.filter((t) => haystack.includes(t)).length / artistTokens.length
    : 0;

  let score = titleScore * 0.7 + artistScore * 0.3;
  // Los canales "Artista - Topic" son audios oficiales autogenerados.
  if (/- topic$/i.test(item.snippet.channelTitle)) score += 0.15;
  // Penaliza covers/karaoke cuando el original no lo es.
  if (JUNK.test(haystack) && !JUNK.test(normalize(track.name))) score -= 0.4;
  return { score, titleScore };
}

// Devuelve { item, confident } — confident=false si el mejor candidato parece incorrecto.
export function bestMatch(track, items) {
  let best = null;
  let bestScore = -Infinity;
  let bestTitleScore = 0;
  for (const item of items || []) {
    const { score, titleScore } = scoreCandidate(track, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
      bestTitleScore = titleScore;
    }
  }
  if (!best) return { item: null, confident: false };
  return { item: best, confident: bestScore >= 0.7 && bestTitleScore >= 0.6 };
}
