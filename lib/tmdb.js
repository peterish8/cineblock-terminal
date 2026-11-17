const CINEBLOCK_BASE = 'https://cineblock.in/api/movies';

const GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  // TV-specific IDs for broader compatibility
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

export async function searchMovie(title, year) {
  try {
    const encodedTitle = encodeURIComponent(title);
    const yearParam = year ? `&year=${encodeURIComponent(year)}` : '';
    const searchUrl = `${CINEBLOCK_BASE}?action=search&query=${encodedTitle}${yearParam}`;
    
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return null;
    
    const searchData = await searchRes.json();
    if (!searchData.results || searchData.results.length === 0) return null;

    const match = searchData.results[0];
    const tmdbId = match.id.toString();

    // Secondary fetch to get full details (like RUNTIME)
    const detailsUrl = `${CINEBLOCK_BASE}?action=details&id=${tmdbId}`;
    const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(8000) });
    let runtime = 0;
    
    if (detailsRes.ok) {
      const details = await detailsRes.json();
      runtime = details.runtime || 0;
    }

    const genres = (match.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);

    return {
      tmdb_id: tmdbId,
      title: match.title, // Fixed: Added missing title
      poster_path: match.poster_path,
      vote_average: match.vote_average,
      release_year: match.release_date ? match.release_date.split('-')[0] : (year || '?'),
      runtime_minutes: runtime, // Crucial for the User's provided layout
      overview: match.overview,
      genres: genres
    };
  } catch (err) {
    return null;
  }
}

// Reuse the website's non-AI wizard endpoint so the CLI and web flow share
// the same three filters and the same server-side TMDB ranking/fallbacks.
export async function findGuidedMovies({ keywordId, languages, yearFrom, yearTo, excludeIds = [] }) {
  try {
    const res = await fetch('https://cineblock.in/api/find-movie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywordId, languages, yearFrom, yearTo, excludeIds }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Guided search failed with status ${res.status}`);

    const data = await res.json();
    return (data.movies || []).slice(0, 5).map((movie) => ({
      tmdb_id: String(movie.id),
      title: movie.title || movie.name || 'Untitled',
      poster_path: movie.poster_path || null,
      vote_average: movie.vote_average || 0,
      release_year: movie.release_date ? movie.release_date.split('-')[0] : '?',
      runtime_minutes: movie.runtime || 0,
      overview: movie.overview || '',
      genres: (movie.genre_ids || []).map((id) => GENRE_MAP[id]).filter(Boolean),
    }));
  } catch (err) {
    throw err;
  }
}
