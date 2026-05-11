const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const todayStr = () => new Date().toISOString().split('T')[0];

module.exports = { isoDate, todayStr };
