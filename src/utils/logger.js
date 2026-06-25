/**
 * Minimal structured (JSON) logger — no external dependency.
 * Emits one JSON object per line so logs are filterable/queryable by an aggregator
 * (Coolify logs, Loki, etc.). Replaces ad-hoc console.* on the critical paths.
 */
function emit(level, msg, meta) {
  const entry = { level, time: new Date().toISOString(), msg: String(msg) };
  if (meta && typeof meta === 'object') {
    for (const k of Object.keys(meta)) entry[k] = meta[k];
  }
  let line;
  try {
    line = JSON.stringify(entry);
  } catch (_) {
    line = JSON.stringify({ level, time: entry.time, msg: entry.msg });
  }
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
