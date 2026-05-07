// Build-time metadata for Groovely
// NOTE: The timestamp comes from Vite env vars that are set at build time.
// To keep this accurate, configure your build to set VITE_BUILD_TIMESTAMP,
// e.g. an ISO string or human-readable date for the current deploy.

const rawTimestamp =
  (import.meta.env.VITE_BUILD_TIMESTAMP as string | undefined) ||
  (import.meta.env.VITE_BUILD_TIME as string | undefined) ||
  '';

let formattedLastUpdated = '';

if (rawTimestamp) {
  const d = new Date(rawTimestamp);
  if (!Number.isNaN(d.getTime())) {
    formattedLastUpdated = d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export const BUILD_LAST_UPDATED = formattedLastUpdated;


