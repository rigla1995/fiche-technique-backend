// SSE connection registry — maps userId → Set<res>
const clients = new Map();
// Admin connections — Set<res> for super_admin users
const adminClients = new Set();

function addClient(userId, role, res) {
  if (role === 'super_admin' || role === 'boss') {
    adminClients.add(res);
  } else {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);
  }
}

function removeClient(userId, role, res) {
  if (role === 'super_admin' || role === 'boss') {
    adminClients.delete(res);
  } else {
    clients.get(userId)?.delete(res);
  }
}

function pushTo(userId, eventType, data) {
  const conns = clients.get(userId);
  if (!conns || conns.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch { /* ignore closed */ }
  }
}

function pushToAdmins(eventType, data) {
  if (adminClients.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of adminClients) {
    try { res.write(payload); } catch { /* ignore closed */ }
  }
}

module.exports = { addClient, removeClient, pushTo, pushToAdmins };
