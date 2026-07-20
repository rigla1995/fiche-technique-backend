/**
 * Vérification E2E des promotions acheteurs + du silence email (migration 174).
 * Prérequis : backend démarré (3000), seed démo « Dar Yasmine ».
 * Run : node scripts/test-promo-portail.js
 */
const API = 'http://localhost:3000';
const CLIENT = { email: 'demo@dar-yasmine.tn', motDePasse: 'DemoVitrine2026!' };
const ACHETEUR = { email: 'm.khelil.prof+acheteur1@gmail.com', motDePasse: 'Portail2026!' };

const ok = (label, cond, detail = '') =>
  console.log(`${cond ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.motDePasse, motDePasse: creds.motDePasse }),
  });
  if (!r.ok) throw new Error(`login ${creds.email} → ${r.status} ${await r.text()}`);
  const d = await r.json();
  return d.token || d.accessToken;
}
const call = async (token, path, opts = {}) => {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: r.status, body };
};

(async () => {
  const tClient = await login(CLIENT);
  const tAch = await login(ACHETEUR);

  // ── 1. Une offre active du catalogue sert de cobaye
  const offres = await call(tClient, '/api/acheteurs/offres');
  const all = [...offres.body.articles, ...offres.body.produits];
  const cible = all.find((o) => o.actif && o.prixUnitaireHt > 0);
  if (!cible) throw new Error('aucune offre active trouvée dans le compte démo');
  console.log(`\n🎯 Cobaye : ${cible.nom} (${cible.articleType}) — ${cible.prixUnitaireHt} DT HT, TVA ${cible.tauxTva}%`);
  ok('champs promo exposés par GET /offres', 'promoPct' in cible && 'promoActive' in cible,
    `promoPct=${cible.promoPct} promoActive=${cible.promoActive}`);

  const prixHtRef = cible.prixUnitaireHt;
  const ttcRef = Math.round(prixHtRef * (1 + cible.tauxTva / 100) * 1000) / 1000;

  // ── 2. Promo 25 % activée
  const PCT = 25;
  const up = await call(tClient, '/api/acheteurs/offres', {
    method: 'POST',
    body: JSON.stringify({
      articleType: cible.articleType, articleId: cible.articleId,
      prixUnitaireHt: prixHtRef, tauxTva: cible.tauxTva, actif: true,
      promoPct: PCT, promoActive: true,
    }),
  });
  const attenduHt = Math.round(prixHtRef * 0.75 * 1000) / 1000;
  const attenduTtc = Math.round(attenduHt * (1 + cible.tauxTva / 100) * 1000) / 1000;
  ok('POST /offres accepte la promo', up.status === 200, JSON.stringify(up.body?.promoPct ?? up.body));
  ok('prix de référence NON écrasé', up.body.prixUnitaireHt === prixHtRef, `${up.body.prixUnitaireHt} DT`);
  ok('prix promo calculé côté serveur', up.body.prixPromoHt === attenduHt, `${up.body.prixPromoHt} vs ${attenduHt}`);

  // ── 3. Catalogue portail : prix barré + prix promo
  const cat = await call(tAch, '/api/portail/catalogue');
  const ligne = cat.body.offres.find((o) => o.articleType === cible.articleType && o.articleId === cible.articleId);
  ok('article présent au catalogue portail', !!ligne);
  ok('prix affiché = prix promo', ligne.prixUnitaireTtc === attenduTtc, `${ligne.prixUnitaireTtc} vs ${attenduTtc}`);
  ok('prix initial barré transmis', ligne.prixInitialTtc === ttcRef, `${ligne.prixInitialTtc} vs ${ttcRef}`);
  ok('taux de promo transmis', ligne.promoPct === PCT, String(ligne.promoPct));

  // ── 4. Commande depuis le portail : le prix figé est le prix promo
  const cmd = await call(tAch, '/api/portail/commandes', {
    method: 'POST',
    body: JSON.stringify({
      notes: 'Test automatique promo — à supprimer',
      lignes: [{ articleType: cible.articleType, articleId: cible.articleId, quantite: 2 }],
    }),
  });
  ok('commande portail créée', cmd.status === 200 || cmd.status === 201, JSON.stringify(cmd.body).slice(0, 120));
  const cmdId = cmd.body?.commande?.id ?? cmd.body?.id;
  const detail = await call(tAch, `/api/portail/commandes/${cmdId}`);
  const l0 = (detail.body.lignes || detail.body.commande?.lignes || [])[0];
  ok('ligne figée au prix promo', l0 && Math.abs(Number(l0.prixTtc ?? l0.prixUnitaireTtc) - attenduTtc) < 0.002,
    `ligne=${JSON.stringify(l0).slice(0, 140)}`);

  // ── 5. Promo coupée : la commande déjà passée ne bouge pas
  await call(tClient, '/api/acheteurs/offres', {
    method: 'POST',
    body: JSON.stringify({
      articleType: cible.articleType, articleId: cible.articleId,
      prixUnitaireHt: prixHtRef, tauxTva: cible.tauxTva, actif: true,
      promoPct: PCT, promoActive: false,
    }),
  });
  const catApres = await call(tAch, '/api/portail/catalogue');
  const ligneApres = catApres.body.offres.find((o) => o.articleType === cible.articleType && o.articleId === cible.articleId);
  ok('promo coupée → prix normal au catalogue', ligneApres.prixUnitaireTtc === ttcRef && ligneApres.promoPct === 0,
    `${ligneApres.prixUnitaireTtc} DT, promo ${ligneApres.promoPct}`);
  ok('taux conservé après désactivation (saisie non perdue)', true, '(vérifié via GET /offres ci-dessous)');
  const offres2 = await call(tClient, '/api/acheteurs/offres');
  const cible2 = [...offres2.body.articles, ...offres2.body.produits]
    .find((o) => o.articleType === cible.articleType && o.articleId === cible.articleId);
  ok('  → promoPct toujours mémorisé', cible2.promoPct === PCT && cible2.promoActive === false,
    `promoPct=${cible2.promoPct} active=${cible2.promoActive}`);

  const detailApres = await call(tAch, `/api/portail/commandes/${cmdId}`);
  const l0b = (detailApres.body.lignes || detailApres.body.commande?.lignes || [])[0];
  ok('commande passée NON rétro-modifiée', l0b && Math.abs(Number(l0b.prixTtc ?? l0b.prixUnitaireTtc) - attenduTtc) < 0.002);

  // ── 6. Validation serveur
  const bad = await call(tClient, '/api/acheteurs/offres', {
    method: 'POST',
    body: JSON.stringify({ articleType: cible.articleType, articleId: cible.articleId, prixUnitaireHt: prixHtRef, tauxTva: cible.tauxTva, actif: true, promoPct: 150, promoActive: true }),
  });
  ok('promo > 100 % refusée', bad.status === 400, String(bad.body?.message));

  // ── 7. Aucun email de statut : la fonction n'existe plus
  const emailSvc = require('../src/services/emailService');
  ok('sendCommandeAcheteurEmail supprimé du service', emailSvc.sendCommandeAcheteurEmail === undefined);
  ok('emails compte acheteur conservés',
    typeof emailSvc.sendInviteEmail === 'function' && typeof emailSvc.sendPasswordResetEmail === 'function');

  // ── 8. Ménage : promo remise à zéro + commande de test annulée
  await call(tClient, '/api/acheteurs/offres', {
    method: 'POST',
    body: JSON.stringify({
      articleType: cible.articleType, articleId: cible.articleId,
      prixUnitaireHt: prixHtRef, tauxTva: cible.tauxTva, actif: true, promoPct: 0, promoActive: false,
    }),
  });
  const ann = await call(tClient, `/api/acheteurs/commandes/${cmdId}/annuler`, {
    method: 'POST', body: JSON.stringify({ motif: 'Commande de test automatique' }),
  });
  ok('commande de test annulée (sans email)', ann.status === 200, String(ann.body?.message));
  console.log('\n🧹 État restauré (promo à 0, commande de test annulée).');
})().catch((e) => { console.error('❌', e); process.exit(1); });
