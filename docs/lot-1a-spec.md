# Lot 1a — Spécification d'implémentation : profil de domaine, composants, tarifs par domaine, wizard étape 2

Référence : `docs/plan-identite-legale-tarifs-domaine-2026-09-28.md` (v2 + addendums v3/v4). Ce document est la **source de vérité pour coder le lot 1a**. Tout ce qui n'y est pas est hors lot.

Dépôts : backend `C:\Users\CHAHDONj\fiche-technique-backend` (Node/Express/PG, JS pur, `node --check`), frontend `C:\Users\CHAHDONj\fiche-technique-frontend` (React + Vite + TS, build = `npm run build` = `tsc -b && vite build` — **TS6133 variables inutilisées = build cassé**).

## 0. Invariants et conventions (non négociables)
- **Aucun changement pour les comptes existants** : mêmes mensualités (au centime), mêmes compteurs nb_activites/nb_labos/nb_gerants/nb_acheteurs, mêmes gardes métier, mêmes écrans côté client (hors nouvelles lignes d'information). `tarifs_domaine` est VIDE au déploiement.
- Migration = **un seul nouveau fichier `migrations/187_domaines_profil_composants_tarifs.sql`**, idempotent (IF NOT EXISTS, DO $$ … pg_constraint pour les contraintes nommées, INSERT … ON CONFLICT), sans CREATE INDEX CONCURRENTLY (le runner encapsule dans BEGIN/COMMIT). Ne JAMAIS modifier un fichier de migration existant.
- Compat des anciens payloads : `nbActivites/nbLabos/nbGerants/nbAcheteurs` restent acceptés partout (9 scripts E2E + AbonnementsManagement les envoient).
- Frontend : confirmations `useConfirm()`, messages `alerte()` (jamais `window.confirm/alert`) ; listes filtrables = `HistoryFilterBar` ; nouvelle page = `React.lazy` dans `App.tsx` (pages admin : PAS de GuideButton) ; textes FR en dur côté admin (pas d'i18n) ; grilles responsives `repeat(auto-fit, minmax(220px,1fr))`.
- Backend : endpoints appelés par le wizard répondent en 4xx (400/409/422), jamais 5xx (l'intercepteur axios redirige les 5xx vers /error et détruit la saisie).
- Rôle `boss` = `super_admin` partout (`requireSuperAdmin` l'inclut déjà).
- Fins de ligne : respecter celles du fichier édité (plusieurs fichiers sont en CRLF).
- Aucun libellé métier ne change dans l'app client dans ce lot (le vocabulaire = lot 2). Seuls les NOUVEAUX affichages (composants, domaine) utilisent les libellés du domaine.

## 1. Migration 187 — DDL exact

```sql
-- 1) domaines_activite : slug fiable + profil
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS lexique JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS regles  JSONB NOT NULL DEFAULT '{}'::jsonb;
-- slug : backfill des NULL depuis nom (minuscules, accents translittérés, [^a-z0-9]+ → '-', trim '-'), dédoublonnage par suffixe -2, -3…
-- puis NOT NULL (l'index unique existe déjà : domaines_activite_slug_key).
-- 2) tarifs_domaine
CREATE TABLE IF NOT EXISTS tarifs_domaine (
  domaine_id INT NOT NULL REFERENCES domaines_activite(id) ON DELETE RESTRICT,
  cle VARCHAR(50) NOT NULL REFERENCES tarifs_config(cle) ON DELETE CASCADE ON UPDATE CASCADE,
  valeur_dt NUMERIC(10,2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (domaine_id, cle)
);
-- 3) composants
CREATE TABLE IF NOT EXISTS domaine_composants (
  id SERIAL PRIMARY KEY,
  domaine_id INT NOT NULL REFERENCES domaines_activite(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  libelle VARCHAR(80) NOT NULL,
  libelle_pluriel VARCHAR(80),
  icone VARCHAR(8),
  aide TEXT,
  type_technique VARCHAR(12) NOT NULL CHECK (type_technique IN ('activite','labo','gerant','acheteurs')),
  vente_active BOOLEAN NOT NULL DEFAULT true,
  production_active BOOLEAN NOT NULL DEFAULT true,
  nb_min INT NOT NULL DEFAULT 0 CHECK (nb_min >= 0),
  nb_max INT CHECK (nb_max IS NULL OR nb_max >= nb_min),
  ordre INT NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (domaine_id, code)
);
-- 4) domaine du compte + détail par composant
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS domaine_id INT REFERENCES domaines_activite(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_abonnement_config_domaine ON abonnement_config(domaine_id);
CREATE TABLE IF NOT EXISTS abonnement_config_composants (
  abonnement_id INT NOT NULL REFERENCES abonnements(id) ON DELETE CASCADE,
  composant_id INT NOT NULL REFERENCES domaine_composants(id) ON DELETE RESTRICT,
  nb INT NOT NULL DEFAULT 0 CHECK (nb >= 0),
  PRIMARY KEY (abonnement_id, composant_id)
);
-- 5) colonne morte
ALTER TABLE profil_entreprise DROP COLUMN IF EXISTS domaine_id;
```
Seeds (dans la même migration, idempotents) :
- `INSERT INTO domaines_activite (nom, slug, description) VALUES ('Restauration','restauration',…) ON CONFLICT (nom) DO UPDATE SET slug = COALESCE(domaines_activite.slug, EXCLUDED.slug)` — idem pour `('Hôtellerie','hotellerie')` et `('Industrie — Céramique','ceramique')` (⚠️ si un domaine « Hôtellerie » existe déjà avec un autre slug, ON CONFLICT (nom) ne pose le slug que s'il est NULL).
- Composants **identité** pour TOUT domaine sans composant et dont le slug ∉ ('hotellerie','ceramique') : `(activite,'Activité','Activités','🏪','activite',ordre 1)`, `(labo,'Labo','Labos','🏭','labo',2)`, `(gerant,'Gérant','Gérants','👤','gerant',3)`, `(acheteurs,'Base acheteurs','Base acheteurs','🤝','acheteurs',4)`.
- Hôtellerie (si aucun composant) : restaurant (activite, vente), bar (activite, vente), room_service (activite, vente), housekeeping (activite, vente_active=false), spa (activite, vente_active=false), cuisine (labo, production), economat (labo, production_active=false, libellé « Économat / Logistique »), responsable (gerant, « Responsable de service »), client_pro (acheteurs, « Client professionnel »). Lexique/règles brouillon = plan V4.4 (lexique au format §2.2 ; règles = défauts).
- Céramique (si aucun composant) : usine (labo, production, « Site de production »), entrepot (labo, production_active=false, « Entrepôt »), showroom (activite, vente, « Showroom / Boutique »), atelier (labo, production, « Atelier »), revendeur (acheteurs, « Revendeur »), responsable (gerant, « Responsable de site »). Lexique brouillon = plan V4.4.
- **Backfill** : (a) `abonnement_config.domaine_id` = l'unique domaine de `client_domaines` du client de l'abonnement si COUNT = 1, sinon le domaine slug 'restauration' ; (b) `client_domaines` du client = exactement ce domaine (DELETE des autres, INSERT si absent) ; (c) `abonnement_config_composants` : pour chaque config, pour chaque type technique T ∈ {activite, labo, gerant, acheteurs} avec compteur > 0 : le PREMIER composant actif de type T du domaine (ordre, id) reçoit le compteur ; s'il n'existe aucun composant de type T dans le domaine, en créer un (code = T, libellés identité ci-dessus) puis l'utiliser. (d) Contrôle : après backfill, pour chaque config, Σ nb par type = compteurs (RAISE EXCEPTION sinon → la migration est atomique).

## 2. Backend

### 2.1 `src/services/pricingEngine.js` (module PUR : aucun require de database/Resend/pdfkit)
Exporte : `cfgVal, prixBaseActivite, computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig, palierAcheteurs, computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig, computeActiviteSupPrice, applyPromoMensualite, applyPromoOnboarding, applyPromoSupplement, onboardingPriceFor(config, tarifs), TARIF_KEYS_SURCHARGEABLES, resolveTarifs(base, overridesByDomaine, domaineId), tarifsFor` (alias de resolveTarifs avec `t = {base, overridesByDomaine}`). Déplacer le code existant d'`abonnementController.js` (l.131-230, 91-131) SANS changer un seul calcul ; `abonnementController` importe et **ré-exporte** les mêmes noms (les autres contrôleurs continuent d'importer depuis abonnementController). `computeBaseMensuelFromConfig` est réécrit en « liste de bases » (A = n fois la base du domaine, tri décroissant, remises par rang) avec test d'identité avec l'ancienne formule.
`resolveTarifs(base, overrides, domaineId)` = `{...base, ...(overrides[domaineId] || {})}` ; une surcharge à 0 est respectée (pas de `||`).
`TARIF_KEYS_SURCHARGEABLES` = toutes les clés de tarifs_config SAUF `prix_base_activite` (legacy).

### 2.2 `src/services/domaineProfilService.js`
- `LEXIQUE_DEFAUT` (dans `src/config/lexiqueDefaut.js`) : 30 clés, format `{ sg, pl, g:'m'|'f', el:boolean, icon }` : activite, activites (alias pl ? NON : une clé = un terme, pluriel dans `pl`), labo, produit_vendable, produit_utilisable, produit_valorise, article, ingredient, recette, fiche_technique, portion, food_cost, cout_matiere, marge, transfert, appro, perte, inventaire, vente, acheteur, gerant, fournisseur, depot, pt, stock, prestataire, supplement, espace_activites, espace_labo, espace_vente, espace_acheteurs, espace_produits, referentiel. Valeurs = termes actuels de l'app.
- `REGLES_DEFAUT` = `{ acheteurs_requiert_labo: true, depot_exige_acheteurs: true, espace_produit_verrou_basique_sans_labo: true, formules: ['basique','premium'], seuil_cout_matiere_pct: 40, types_perte: ['avarie','dechet'], supplement_max_composants: 1, b2b_depuis_activite: false }`.
- `resolveProfil(row)` → `{ id, slug, nom, description, lexique: deepMerge(LEXIQUE_DEFAUT, row.lexique), regles: {...REGLES_DEFAUT, ...row.regles}, composants: [...] }`.
- `getProfil(domaineId)` (cache mémoire TTL 60 s, `invalidate()` appelé après PUT/DELETE) ; `getProfilForClient(clientId)` : domaine du DERNIER abonnement (`ORDER BY a.id DESC LIMIT 1`), gérant → `gerant_parent_id` ; NULL → profil « restauration » (slug) sinon profil par défaut sans id.
- `getDomaineDefautId()` = id du slug 'restauration'.

### 2.3 `src/services/configComposantsService.js`
- `deriveCompteurs(composantsAvecType)` → `{ nb_activites, nb_labos, nb_gerants, nb_acheteurs }` (Σ par type ; acheteurs = MAX des composants acheteurs).
- `validerComposition({ compteurs, regles, composants })` → liste d'erreurs (400) : nb_min/nb_max par composant ; `acheteurs_requiert_labo` : nb_acheteurs > 0 ⇒ nb_labos ≥ 1 ; `depot_exige_acheteurs` : nb_activites = 0 ⇒ nb_labos ≥ 1 ET nb_acheteurs > 0 ; 0 ≤ nb_acheteurs ≤ 100 ; palier acheteurs ∈ {0,10,20,50,100} (comme aujourd'hui). Messages FR + `code` machine (`COMPOSITION_INVALIDE`, `ACHETEURS_SANS_LABO`, `DEPOT_SANS_ACHETEURS`, …).
- `composantsDepuisCompteurs(domaineId, compteurs)` (compat anciens payloads) : premier composant actif de chaque type (création à la volée d'un composant identité si absent, comme le backfill).
- `applyComposants(db, aboId, { domaineId, composants: [{ code | composantId, nb }], mode: 'set' | 'add' })` : dans la transaction `db` fournie : valide (codes ∈ domaine, actifs), écrit `abonnement_config_composants` (mode set = remplace tout ; add = incrémente), recalcule et écrit les 4 compteurs dans `abonnement_config` (et `domaine_id` si fourni), renvoie `{ compteurs, composants }`. **Seul écrivain des compteurs** : brancher `createAbonnement`, `updateAbonnementConfig`, `toggleModuleAcheteurs` (nb_acheteurs), `supportController.traiter`, `webhookController` (avenant : mode add sur le composant du type correspondant — 1ᵉʳ composant du type, comme le backfill).
- `listComposantsConfig(aboId)` → `[{ composantId, code, libelle, libellePluriel, icone, typeTechnique, nb }]`.

### 2.4 Grille par domaine — `abonnementController`
- `loadTarifs()` → `{ base: {cle: valeur}, overridesByDomaine: {domaineId: {cle: valeur}} }` (2 requêtes). `loadAllTarifs()` conservé = `base` (compat).
- Les 15 consommateurs passent par `tarifsFor(t, cfg.domaine_id)` : getAbonnement, createAbonnement, getMontantMois, upsertPaiement, insertPromoForAbonnement, enforcerStatuts (charger une fois, résoudre par abonnement), getPricingPreview (+ onboardingPrice), getSupplementPricing, getClientSupplementPricing, computeEffectivePricing, computeAvenantPricing, previewContratPdf, supportController.traiter/previewAvenant (remplacer leurs SELECT directs par loadTarifs + computeMensuelTotalFromConfig), demandeController.create. Les configs construites à la main copient `domaine_id` : `computeAvenantPricing.newCfg`, `getPricingPreview.mockConfig`, `previewContratPdf.mockCfg`, payload `clientsController.create → createAbonnement`.
- `updateAbonnementConfig` **préserve** `domaine_id` si absent du payload (COALESCE) ; `domaineId: null` explicite = repli restauration (jamais NULL en base après ce lot : NOT NULL applicatif).
- `recalcPaiementsEnAttente(db, aboId)` : extrait de `insertPromoForAbonnement` (UPDATE des paiements `en_attente`/`gratuit` du mois courant et futurs avec le total résolu × promo active) ; appelé après tout changement de composants/formule/domaine (updateAbonnementConfig, PUT /admin/clients domaineId, traiter/webhook avenant).
- API tarifs : `GET /api/abonnements/tarifs?domaineId=` → `{ [cle]: { id, valeur, valeurGenerale, surcharge, description } }` (sans domaineId : `surcharge = null`, `valeur = valeurGenerale`) ; `PUT /api/abonnements/tarifs/:cle` body `{ valeur, domaineId? }` → sans domaineId = comportement actuel ; avec domaineId : 400 si cle ∉ TARIF_KEYS_SURCHARGEABLES, upsert tarifs_domaine, réponse `{ cle, domaineId, valeur, clientsImpactes }` (COUNT abonnement_config WHERE domaine_id) ; `DELETE /api/abonnements/tarifs/:cle?domaineId=` → 400 sans domaineId, supprime la surcharge, `{ clientsImpactes }`. Tous `requireSuperAdmin`.
- `getPricingPreview` accepte `domaineId` et `composants` (JSON encodé en query : `[{code, nb}]`) ; si composants fournis → dérive les compteurs (sinon anciens params) ; réponse existante + `domaine: {id, slug, nom}` + `composants: [{code, libelle, libellePluriel, icone, typeTechnique, nb}]` + `regles`.
- `mapAbonnementConfig` += `domaineId, domaineSlug, domaineNom, composants[]` ; `getAbonnement` (withPricing) les renvoie ; `PUT /api/abonnements/client/:id/config` accepte `{ domaineId?, composants?: [{code, nb}], formuleActivites?, montantOnboarding? }` OU les anciens compteurs → applyComposants(mode set) puis recalcPaiementsEnAttente ; erreurs de composition → 400 `{ message, code }`.

### 2.5 Domaines — `domainesController` / `routes/domaines.js`
- `GET /api/domaines` : admin/boss → tous, avec `composants[]`, `lexique` (résolu), `regles` (résolues), `nbClients` (COUNT DISTINCT abonnement_config.domaine_id via abonnements.client_id) ; client/gérant → le domaine de leur compte (profil résolu). Le paramètre `hasIngredients` disparaît. `?inclureInactifs=1` inutile (pas de flag actif domaine).
- `GET /api/domaines/:id` → profil résolu + composants (tous, actifs ou non) + `tarifs` (résultat de GET tarifs?domaineId).
- `POST /api/domaines` `{ nom, slug?, description? }` → crée + 4 composants identité ; 409 si nom/slug existant.
- `PUT /api/domaines/:id` `{ nom?, slug?, description?, lexique?, regles?, composants?: [{ id?, code, libelle, libellePluriel, icone, aide, typeTechnique, venteActive, productionActive, nbMin, nbMax, ordre, actif }] }` : upsert des composants par code ; un composant absent du tableau est SUPPRIMÉ s'il n'est référencé par aucune `abonnement_config_composants`, sinon 409 `{ code:'COMPOSANT_UTILISE', composants:[…] }` ; validations (code `^[a-z0-9_]{2,30}$`, type ∈ 4, lexique = objet de `{sg,pl,g,el,icon}` partiels, regles = clés connues). Invalide le cache.
- `DELETE /api/domaines/:id` : 409 `{ code:'DOMAINE_UTILISE', nbClients, nbSurcharges }` si référencé (abonnement_config, client_domaines, tarifs_domaine) ; sinon DELETE (composants en cascade). Mapper 23503 → 409.
- `mapDomaine` expose `{ id, slug, nom, description, nbClients?, composants, lexique, regles }`.

### 2.6 Clients — `clientsController`
- `create` : lit `domaineId` (int) — si absent : `domaineIds[0]` (legacy) sinon domaine défaut ; lit `composants` `[{code, nb}]` — si absent : `composantsDepuisCompteurs(domaineId, {nbActivites…})`. Valide (composition + règles du profil) AVANT toute écriture → 400. Écrit `client_domaines = [domaineId]` (saveClientDomaines existant). `createAbonnement(clientId, montantOnboarding, { domaineId, composants, formuleActivites })` : INSERT abonnements + abonnement_config (domaine_id) + applyComposants(set) + paiement du mois (total résolu par domaine), **dans une seule transaction** (aujourd'hui createAbonnement est appelé hors transaction : le laisser hors de la transaction utilisateurs/profil mais rendre createAbonnement lui-même transactionnel). Contrat : `submitContratForSignature` reçoit `config.composants` + `domaineNom` (cf. 2.8).
- `update` : accepte `domaineId` → `client_domaines=[domaineId]`, `UPDATE abonnement_config SET domaine_id` (dernier abonnement) + recalcPaiementsEnAttente ; si les composants existants ne correspondent à aucun code du nouveau domaine → re-mapper par type (1ᵉʳ composant de chaque type, création identité si besoin) via applyComposants(set) ; `domaineIds` legacy accepté (= [domaineId]). 400 si domaine inconnu.
- `mapClient` += `domaineId, domaineNom` (JOIN sur le dernier abonnement → abonnement_config → domaines_activite ; `domaineIds` conservé pour compat).
- `validateCreate/validateUpdate` (routes/admin.js) : corriger `body('phone')` → `telephone` (bug existant) ; ajouter `domaineId` optional isInt, `composants` optional isArray.

### 2.7 Exposition du profil
- `/auth/me` += `domaine: { id, slug, nom, lexique, composants, regles } | null` (client : son abonnement ; gérant : parent ; admin/boss : null). `GET /api/entreprise` += même objet.
- `clientConfigService` : `SNAPSHOT_VERSION = 3`, snapshot += `domaine: { id, slug, nom }` ; `buildLineFromSnapshot` ajoute « Domaine d'activité : X ».

### 2.8 Contrat / avenant (flux PDF)
- `contractPdfService.buildContratDocument` : `config.composants` (`[{ libelle, libellePluriel, nb }]`) et `config.domaineNom` transmis à `generate.buildContrat` ; `generate.js configTable` : en mode PDF (non templateMode), si `data.config.composants?.length` → une ligne par composant (libellé pluriel si nb > 1, valeur nb) à la place des 3 lignes fixes activités/labos/gérants (Formule, Option Acheteurs inchangées) + ligne « Domaine d'activité » si `domaineNom` ; en templateMode : inchangé (fond statique). Idem `buildAvenant` quand `config.composants` fourni. `regenerateContratPdf` et `previewContratPdf` alimentent ces champs.
- Flux template DocuSeal : `buildContractPricingFields` ajoute `{ name: 'Domaine', value: domaineNom }` (filtré/retry 422 tant que le template n'a pas le champ — comportement existant, documenter dans CHAMPS.md).

### 2.9 Règles paramétrées (défaut = comportement actuel)
- `requireFormulePremium` (middleware/auth.js) et `manuelVisibilite.js` et `onboardingEtat.js` : `espaceProduitVerrouille(cfg, regles)` = `regles.espace_produit_verrou_basique_sans_labo && formule==='basique' && nb_labos===0` — fonction unique dans `domaineProfilService`.
- Gardes de composition (clientsController.create, updateAbonnementConfig, supportController.create/traiter) via `validerComposition`.

### 2.10 Scripts et tests
- `test/pricingEngine.test.js` (`node --test`, runner déjà `npm test`) : identité ancienne/nouvelle formule sur 20 configs ; resolveTarifs (null, sans surcharge, partielle, à 0, domaine inconnu) ; n = 0/1/2/3 ± labo, basique/premium, repli legacy, paliers 0…150, arrondis, promos, cas Hôtellerie 300 DT ; invariant `total(cfg, tarifsFor(t,null)) === total(cfg, base)`.
- `scripts/test-composants.js` (E2E, backend local sur :3000, admin local) : POST /admin/clients avec domaineId + composants → config dérivée exacte ; POST legacy (nbActivites…) → composants identité ; pricing-preview avec composants ; PUT config composants ; PUT tarifs surcharge domaine → pricing-preview et mon-abonnement changent, DELETE → retour ; POST /api/domaines + PUT profil + DELETE 409 si utilisé ; composition invalide → 400 avec code ; /auth/me.domaine présent ; nettoyage des clients créés (DELETE /admin/clients/:id).
- `scripts/check-invariant-config.js` : pour tous les abonnement_config : Σ composants par type = compteurs ; mensualité `tarifsFor(t, domaine_id)` = `tarifsFor(t, null)` tant que tarifs_domaine est vide. Exit ≠ 0 sinon.
- `scripts/seed-demo-vitrine.js` et `scripts/seed-khelil.js` : retirer `domaine_id` de l'INSERT profil_entreprise ; poser `abonnement_config.domaine_id` + composants via le service.
- `scripts/cleanup-boss-client-data.js` : rien (cascade).

## 3. Frontend

### 3.1 Types (`src/types/index.ts`)
`Composant { id?, code, libelle, libellePluriel?, icone?, aide?, typeTechnique: 'activite'|'labo'|'gerant'|'acheteurs', venteActive, productionActive, nbMin, nbMax: number|null, ordre, actif }` ; `LexiqueEntree { sg, pl, g:'m'|'f', el:boolean, icon?: string }` ; `DomaineProfil { id, slug, nom, description?, nbClients?, composants: Composant[], lexique: Record<string, LexiqueEntree>, regles: Record<string, unknown> }` (remplace `DomaineActivite`, alias conservé) ; `AbonnementConfig += domaineId, domaineSlug, domaineNom, composants: { code, libelle, libellePluriel, icone, typeTechnique, nb }[]` ; `TarifsConfig` valeurs `+= valeurGenerale, surcharge: number|null` ; `User += domaine?: DomaineProfil | null` ; `Client += domaineId, domaineNom`.

### 3.2 Page admin Domaines (`AdminDomainesPage.tsx` + nouvelle page lazy `AdminDomaineEditPage.tsx`, route `/admin/domaines/:id`)
- Liste : cards (nom, slug, N composants, N clients) + recherche (HistoryFilterBar existant) + « Nouveau domaine » (modal nom/slug/description → POST). Suppression : bouton → useConfirm → DELETE ; 409 → alerte « Domaine utilisé par N compte(s) et N surcharge(s) tarifaires ».
- Édition (page dédiée, 4 onglets) :
  - **Composants** : tableau éditable (libellé, pluriel, icône, type technique select, vend ☐, produit ☐, min, max, ordre, actif) + « Ajouter » (code généré depuis le libellé, éditable tant que nouveau) + supprimer (confirm ; 409 COMPOSANT_UTILISE → alerte). Enregistrer = PUT profil (composants).
  - **Lexique** : 30 lignes (clé, libellé de la clé, singulier, pluriel, genre m/f, élision ☐, icône) ; champ vide = valeur par défaut affichée en placeholder grisé ; « Réinitialiser » vide la ligne. Enregistrer = PUT profil (lexique = seulement les écarts).
  - **Règles** : toggles/inputs pour les 8 clés avec aide courte. Enregistrer = PUT profil (regles).
  - **Grille tarifaire** : les 13 TARIF_KEYS (mêmes libellés/sections que TarifsConfig) : « Héritée : X DT » grisé ; input vide avec placeholder = héritée ; saisie → dirty → « Sauvegarder » (PUT tarifs/:cle {valeur, domaineId}) ; surcharge existante → input rempli, bordure accent, tag « Surcharge », bouton « ↺ Hériter » (DELETE). Avant PUT/DELETE : useConfirm « N compte(s) seront re-tarifés dès le prochain paiement » si clientsImpactes > 0 (récupérer via GET /api/domaines/:id → nbClients). Réutiliser `TarifField` étendu (`inherited`, `onReset`) plutôt que dupliquer.
- `App.tsx` : lazy + route ; Sidebar/AdminDashboard : liens inchangés.

### 3.3 `TarifsConfig.tsx`
- Simulateur : remplacer `calcMensuel/priceForTier/priceWithLabo` par un appel `GET /api/abonnements/pricing-preview` (débounce 400 ms) avec un sélecteur de domaine (« Grille générale » + domaines) ; le simulateur montre la grille ENREGISTRÉE (note explicite). Corriger `|| DEFAULTS[k]` → `Number.isFinite(x) ? x : DEFAULTS[k]`.
- Bandeau « Les surcharges par domaine se règlent dans Domaines d'activités → [domaine] → Grille tarifaire » avec lien.

### 3.4 `AddClientModal.tsx`
- Étape 1 : retirer le bloc Domaines (states `domaines/selectedDomaines` retirés ; `step1Valid` = nom + email (check) + téléphone) ; texte d'aide périmé supprimé.
- Étape 2 : (1) « Domaine d'activité » = radio-cards (GET /api/domaines : nom + description + N composants), obligatoire ; (2) « Configuration » = un `Counter` (composant existant, ajouter prop `max`) par composant actif du domaine (ordre), libellé = `icone + libelle`, sub = aide ; le composant de type `acheteurs` s'affiche comme le select de paliers actuel (0/10/20/50/100), désactivé tant que Σ labo = 0 (règle acheteurs_requiert_labo) ; avertissements dépôt existants pilotés par `regles` ; (3) cartes Formule si Σ activite ≥ 1 (inchangées) ; (4) `montantOnboarding` devient un input éditable pré-rempli par `onboardingPrice` ; (5) PricingCard : `fetchPreview` envoie `domaineId` + `composants` (JSON) ; affichage inchangé + bandeau « Grille : {domaineNom} ». `step2Valid` = domaine choisi + composition valide (miroir client des règles ; le serveur reste juge) + montantOnboarding.
- Étape 4 : contrat-preview envoie `domaineId + composants` (+ compteurs dérivés pour compat) ; récap liste « 2 Restaurants · 1 Cuisine » + « Domaine : Hôtellerie ».
- `handleSubmit` : POST `{ nom, email, telephone, domaineId, composants, nbActivites, nbLabos, nbGerants, nbAcheteurs (dérivés), formuleActivites, montantOnboarding, contractPdfBase64, promotions }`.
- Pré-sélection du domaine si un seul existe. Conversion demande d'accès : initialValues inchangés (nbPointsVente etc. = lot 3).

### 3.5 `ClientsManagement.tsx`
- Modal « Gérer les domaines » → « Domaine d'activité » : select unique (GET /api/domaines) + note « Changer le domaine change la grille tarifaire et le menu de composants » → useConfirm → PUT /admin/clients/:id { domaineId }. Bouton-chip de la card : `🏷️ {domaineNom}`. Fiche Consulter : ligne « Domaine ».
- Popup Config : tuiles générées depuis `config.composants` (icône, libellé, nb) + tuile « Domaine » ; le palier acheteurs reste calculé comme aujourd'hui.

### 3.6 `AbonnementsManagement.tsx`
- Onglet Configuration : bloc « Domaine : X » + breakdown par composant (libellé × nb) ; édition des composants (Counters + select acheteurs) → PUT config `{ composants }` (useConfirm avec impact) ; `changerFormule` inchangé.

### 3.7 `MonAbonnementPage.tsx`
- Ligne « Domaine d'activité : X » ; lignes de capacité générées depuis `config.composants` (repli sur les 3 lignes actuelles si vide).

### 3.8 Build
`npm run build` doit passer (tsc strict, aucune variable inutilisée). Pas de nouveau GuideButton (pages admin).

## 4. Ordre de travail recommandé
B1 backend : migration 187 → pricingEngine + tests → loadTarifs/tarifsFor dans les 15 consommateurs → API tarifs par domaine → `npm test` + `node --check` sur tous les fichiers touchés.
B2 backend : domaineProfilService + lexique/règles par défaut → configComposantsService → domainesController/API → clientsController create/update/mapClient → createAbonnement/updateAbonnementConfig/toggleModuleAcheteurs/support/webhook via applyComposants → /auth/me + entreprise → contrat (composants/domaine) → snapshot IA → seeds → scripts E2E → exécution locale (backend :3000, migrations au boot) : `npm test`, `node scripts/check-invariant-config.js`, `node scripts/test-composants.js`, `node scripts/test-contrat-admin.js`, `node scripts/test-formules.js`.
F1 frontend : types + AdminDomainesPage/AdminDomaineEditPage + TarifsConfig + App.tsx.
F2 frontend : AddClientModal + ClientsManagement + AbonnementsManagement + MonAbonnementPage (types AbonnementConfig/Client : F2 ; types Domaine/Composant/Lexique : F1 — coordonner dans `types/index.ts`).
Puis : `npm run build`, revue adversariale, corrections, E2E complet, merge develop + main.
