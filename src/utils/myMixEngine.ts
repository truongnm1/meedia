import { MediaItem } from '../types/media';

// v2 storage key cleanly resets any previous 1-day/testing clicks
const STORAGE_KEY = 'meedia_play_history_v2';
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000; // 2-week evaluation window
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;     // 1-week minimum maturity
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PLAY_DEBOUNCE_MS = 60 * 1000;            // 60-second debounce between repeat logs

export interface TrackPlayRecord {
  path: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  cover_art?: string | null;
  duration_secs?: number | null;
  duration_formatted?: string | null;
  extension: string;
  media_type: 'audio' | 'video';
  size_formatted: string;
  size_bytes: number;
  playTimestamps: number[];
}

export interface MyMixResult {
  folderName: string;
  summaryText: string;
  tracks: MediaItem[];
}

/**
 * Loads play history records from localStorage and cleans up entries older than 14 days (2 weeks).
 */
export function getPlayHistory(): Record<string, TrackPlayRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: Record<string, TrackPlayRecord> = JSON.parse(raw);
    const now = Date.now();
    let changed = false;

    // Strict 14-day window: prune entries older than 2 weeks
    for (const key of Object.keys(parsed)) {
      const record = parsed[key];
      const validTimestamps = record.playTimestamps.filter((t) => now - t < FOURTEEN_DAYS_MS);
      if (validTimestamps.length !== record.playTimestamps.length) {
        if (validTimestamps.length === 0) {
          delete parsed[key];
        } else {
          record.playTimestamps = validTimestamps;
        }
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to read play history:', err);
    return {};
  }
}

/**
 * Records a single play event for a track with debounce.
 * Only called after user has continuously listened for >= 30 seconds (or >= 50% for short tracks).
 */
export function recordTrackPlay(track: MediaItem): void {
  if (!track || !track.path) return;
  try {
    const history = getPlayHistory();
    const now = Date.now();
    const existing = history[track.path];

    if (existing) {
      // Debounce: don't log duplicate play within 60s
      const lastPlay = existing.playTimestamps[existing.playTimestamps.length - 1];
      if (lastPlay && now - lastPlay < MIN_PLAY_DEBOUNCE_MS) {
        return;
      }

      existing.playTimestamps.push(now);
      existing.title = track.title || existing.title;
      existing.artist = track.artist || existing.artist;
      existing.album = track.album || existing.album;
      if (track.cover_art) existing.cover_art = track.cover_art;
    } else {
      history[track.path] = {
        path: track.path,
        title: track.title || track.name,
        artist: track.artist,
        album: track.album,
        cover_art: track.cover_art,
        duration_secs: track.duration_secs,
        duration_formatted: track.duration_formatted,
        extension: track.extension,
        media_type: track.media_type,
        size_formatted: track.size_formatted,
        size_bytes: track.size_bytes,
        playTimestamps: [now],
      };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('Failed to record track play:', err);
  }
}

/**
 * Calculates a track's score within the 14-day window using exponential decay (7-day half-life):
 * Weight = 2 ^ (-elapsedDays / 7)
 */
function calculateScore(timestamps: number[], now: number): number {
  let score = 0;
  for (const t of timestamps) {
    const elapsedMs = now - t;
    if (elapsedMs >= 0 && elapsedMs < FOURTEEN_DAYS_MS) {
      const elapsedDays = elapsedMs / ONE_DAY_MS;
      score += Math.pow(2, -elapsedDays / 7);
    }
  }
  return score;
}

/**
 * Computes YouTube-style "My Mix" adhering strictly to a 1-to-2 week aggregation model:
 *
 * STRICT CRITERIA TO APPEAR:
 * 1. Timeline Maturity: Listening activity must span across at least 7 days OR across at least 3 distinct calendar days
 *    within the 14-day window. (Prevents My Mix from acting as an immediate "recently played" or day-1 history).
 * 2. Strict Repeat Frequency: Single-play tracks (count = 1) are 100% disqualified.
 *    A track must have >= 3 plays OR plays on >= 2 distinct days to qualify as a candidate.
 * 3. Threshold: Must have at least 4 distinct qualifying repeat songs with score >= 1.2.
 *
 * If criteria are not met, returns null (mix stays completely hidden).
 */
export function calculateMyMix(allLibraryTracks: MediaItem[] = []): MyMixResult | null {
  const history = getPlayHistory();
  const now = Date.now();

  // 1. Collect all timestamps in the 14-day window to evaluate timeline maturity
  const allValidTimestamps: number[] = [];
  for (const record of Object.values(history)) {
    for (const t of record.playTimestamps) {
      if (now - t < FOURTEEN_DAYS_MS) {
        allValidTimestamps.push(t);
      }
    }
  }

  if (allValidTimestamps.length === 0) {
    return null;
  }

  const earliestTimestamp = Math.min(...allValidTimestamps);
  const distinctActiveDays = new Set(
    allValidTimestamps.map((t) => new Date(t).toDateString())
  ).size;

  // Strict 1-to-2 Week Gate:
  // History must span at least 7 days (1 week) OR have listening activity across at least 3 distinct days.
  if (now - earliestTimestamp < SEVEN_DAYS_MS && distinctActiveDays < 3) {
    return null;
  }

  // 2. Score candidate tracks under strict repeat requirements
  const scoredTracks: Array<{ track: MediaItem; score: number }> = [];

  for (const record of Object.values(history)) {
    const recentTimestamps = record.playTimestamps.filter((t) => now - t < FOURTEEN_DAYS_MS);

    // Rule: Single plays are NEVER part of My Mix (exploration/casual listening)
    if (recentTimestamps.length < 2) {
      continue;
    }

    // Must be played on >= 2 distinct days OR played >= 3 times in 14 days
    const distinctSongDays = new Set(
      recentTimestamps.map((t) => new Date(t).toDateString())
    ).size;
    if (recentTimestamps.length < 3 && distinctSongDays < 2) {
      continue;
    }

    const score = calculateScore(recentTimestamps, now);
    if (score >= 1.2) {
      scoredTracks.push({
        track: {
          name: record.title,
          path: record.path,
          extension: record.extension,
          media_type: record.media_type,
          size_bytes: record.size_bytes,
          size_formatted: record.size_formatted,
          duration_secs: record.duration_secs,
          duration_formatted: record.duration_formatted,
          title: record.title,
          artist: record.artist,
          album: record.album,
          cover_art: record.cover_art,
        },
        score,
      });
    }
  }

  // Strict Threshold: Must have at least 4 established repeat songs
  if (scoredTracks.length < 4) {
    return null;
  }

  // Sort descending by recency-weighted frequency score
  scoredTracks.sort((a, b) => b.score - a.score);

  // 3. Assemble Core Tracks (Top repeat songs, up to 12)
  const coreTracks = scoredTracks.slice(0, 12).map((s) => s.track);
  const includedPaths = new Set(coreTracks.map((t) => t.path));

  // Identify top favorite artists from recent core listening
  const topArtists = new Set<string>();
  for (const t of coreTracks) {
    if (t.artist && t.artist.trim() && t.artist !== 'Unknown Artist') {
      topArtists.add(t.artist.toLowerCase());
    }
  }

  // 4. Connected Discovery Tracks (30% related pool from favorite artists in library)
  const connectedTracks: MediaItem[] = [];
  if (allLibraryTracks && allLibraryTracks.length > 0 && topArtists.size > 0) {
    for (const libTrack of allLibraryTracks) {
      if (coreTracks.length + connectedTracks.length >= 20) break;
      if (!includedPaths.has(libTrack.path) && libTrack.artist) {
        if (topArtists.has(libTrack.artist.toLowerCase())) {
          connectedTracks.push(libTrack);
          includedPaths.add(libTrack.path);
        }
      }
    }
  }

  const finalTracks = [...coreTracks, ...connectedTracks];

  // If still under 12 tracks, fill with remaining repeat-scored tracks
  if (finalTracks.length < 12 && scoredTracks.length > 12) {
    for (let i = 12; i < scoredTracks.length && finalTracks.length < 20; i++) {
      const candidate = scoredTracks[i].track;
      if (!includedPaths.has(candidate.path)) {
        finalTracks.push(candidate);
        includedPaths.add(candidate.path);
      }
    }
  }

  // Dynamic Title: "My Mix — {Top Song 1}, {Top Song 2}, {Top Artist}"
  const firstSong = finalTracks[0]?.title || 'Featured Track';
  const secondSong = finalTracks[1]?.title;
  const leadArtist =
    finalTracks[0]?.artist ||
    finalTracks.find((t) => t.artist && t.artist !== 'Unknown Artist')?.artist;

  let folderName = `My Mix — ${firstSong}`;
  if (secondSong && secondSong !== firstSong) {
    folderName += `, ${secondSong}`;
  }
  if (leadArtist && leadArtist !== 'Unknown Artist') {
    folderName += `, ${leadArtist}`;
  }

  const summaryParts: string[] = [];
  if (firstSong) summaryParts.push(firstSong);
  if (secondSong && secondSong !== firstSong) summaryParts.push(secondSong);
  if (leadArtist) summaryParts.push(leadArtist);

  return {
    folderName,
    summaryText: summaryParts.join(' • '),
    tracks: finalTracks,
  };
}
