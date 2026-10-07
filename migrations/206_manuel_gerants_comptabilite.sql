-- 206 — LabFlow Compta, étape S3b : partie « Gérants Comptabilité » de la fiche Gérants (comptable du client, gérants comptables supplémentaires, niveaux, demande d'ajout).
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["gerants"],"titres":[],"entrees":[],"variantes":[]}

DO $m206$
DECLARE
  t TEXT;
  n INTEGER;
  faites INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
  retouchees TEXT[] := ARRAY[]::TEXT[];
  b_faites INTEGER := 0;
  b_deja INTEGER := 0;
  b_gardees TEXT[] := ARRAY[]::TEXT[];
  v_faites INTEGER := 0;
  v_deja INTEGER := 0;
  v_gardees TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── gerants ──
  t := $m206_gerants$## 👥 Comptes [[court:gerant:pl]]

Cet écran vous permet de donner un accès LabFlow à vos collaborateurs : chaque **[[nom:gerant]]** reçoit une invitation par email et ne voit que [[le:activite:pl]] et [[nom:labo:pl]] que vous lui affectez. Vous le trouvez dans le menu latéral, entrée **[[Nom:gerant:pl]]**.

### Ce que vous voyez

Le bandeau affiche le compteur **[[Nom:gerant:pl]]** ([[acc:gerant:utilisé:utilisée:pl]] / [[acc:gerant:inclus:incluse:pl]] dans votre abonnement), le nombre [[de:gerant:pl]] **[[acc:gerant:Actifs:Actives]]**, et le bouton **+ [[Nouveau:gerant]]** — remplacé par la mention 🔒 *Limite atteinte* quand le quota est plein. Un bandeau jaune signale les **invitations en attente d'activation**.

Chaque [[nom:gerant]] apparaît sous forme de carte avec :

- ses initiales, son nom, son email et son téléphone ;
- son statut : **● [[acc:gerant:Actif:Active]]** ou **○ [[acc:gerant:Inactif:Inactive]]**, plus **⏳ Invitation en attente** tant qu'[[acc:gerant:il:elle]] n'a pas activé son compte ;
- un badge **Gratuit** ou le montant facturé (en DT/mois) ;
- 📍 la liste de ses **affectations** ([[nom:activite:pl]] et [[nom:labo:pl]]) ;
- les actions : **✉️ Renvoyer** l'invitation (si non activée), **⏸ Désactiver** / **▶ Activer**, **🗑** supprimer.

### Actions pas à pas

1. Cliquez **+ [[Nouveau:gerant]]** et renseignez le **nom**, le **téléphone** et l'**email** (tous obligatoires). La disponibilité de l'adresse email est vérifiée en direct : une adresse déjà utilisée est refusée.
2. Cochez [[det:activite:le:pl]]**[[nom:activite:pl]] et [[nom:labo:pl]] assignés** — au moins un est obligatoire. Le lien *✓ Tout* coche l'ensemble d'un clic.
3. Validez avec **✓ Créer et envoyer l'invitation** : [[le:gerant]] reçoit un email et active son compte en cliquant sur le lien puis en définissant son mot de passe.
4. Tant que l'invitation n'est pas acceptée, le badge ⏳ reste affiché : utilisez **✉️ Renvoyer** si l'email s'est égaré.
5. Pour suspendre temporairement un accès, cliquez **⏸ Désactiver** (réversible à tout moment avec ▶ Activer). Pour retirer définitivement l'accès, utilisez 🗑 (une confirmation est demandée).

### Gérants Comptabilité (module Comptabilité)

Si votre compte a le **module Comptabilité**, la page montre aussi la partie **Gérants Comptabilité** : les personnes qui ont accès à votre comptabilité dans LabFlow Compta, et à elle seule (elles ne voient ni [[le:stock]] ni [[le:vente:pl]]). Le bouton **+ [[Nouveau:gerant]]** vous demande alors d'abord le type : **Stock / Vente** ou **Comptabilité**.

- **Votre comptable** : son accès est compris dans le module. Tant que vous ne l'avez pas désigné, il apparaît « À désigner » : cliquez **Désigner**, puis indiquez son nom, son adresse email et son niveau.
- **Gérants comptables supplémentaires** : d'autres accès, dans la limite achetée. Limite atteinte : bouton **Demander des gérants comptables** ; l'équipe LabFlow valide votre demande, facturée à partir du mois suivant.
- **Niveaux** : Consultation (tout lire, sans rien écrire), Saisie (saisir les pièces et les écritures, sans valider, clôturer ni configurer), Complet (tout).

Une adresse inconnue reçoit une invitation à activer son compte LabFlow Compta (lien valable 48 heures, **✉️ Renvoyer** s'il s'est égaré) ; une adresse déjà connue reçoit l'accès tout de suite. **✏️ Modifier** change le nom, le niveau ou l'adresse (une autre adresse donne l'accès à une autre personne) ; **🗑 Retirer** reprend l'accès (celui de votre comptable redevient « À désigner »). Si votre comptable quitte l'accès de lui-même, vous êtes prévenu par la cloche et par email.

### Points d'attention

:::regle
Trois comptes [[nom:gerant:pl]] gratuits sont inclus. Au-delà, le formulaire vous prévient : chaque [[nom:gerant]] supplémentaire est [[acc:gerant:facturé:facturée]] 80 DT/mois et nécessite une validation de l'équipe LabFlow. Le nombre total reste plafonné par votre abonnement.
:::

:::attention
[[Le:gerant]] ne voit que son périmètre : [[acc:gerant:il:elle]] travaille sur [[le:stock]], [[le:appro:pl:court]], [[le:perte:pl]], [[le:inventaire:pl]] (et [[le:vente:pl]] si le module est actif) de [[son:activite:pl]] et [[nom:labo:pl]] affectés, mais n'a pas accès à la gestion [[un:activite:pl]], [[un:gerant:pl]], de l'abonnement ni des paiements.
:::

:::astuce
Créez [[un:gerant]] par responsable de site plutôt qu'un compte partagé : les historiques gardent ainsi la trace de qui a fait quoi.
:::

### Voir aussi

- [Les rôles dans LabFlow](#roles) — client vs [[nom:gerant]] en détail
- [Tableau de bord [[compl:gerant]]](#dashboard-gerant) — ce que voit votre collaborateur
- [[[Nom:activite:pl]] & [[nom:labo:pl]]](#activites) · [Mon abonnement](#abonnement)$m206_gerants$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'gerants'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '56bdd6d8969e4ead6ccbbb9dbbe0cd9a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'gerants'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'gerants'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'gerants' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'gerants'::TEXT; END IF;
  RAISE NOTICE '206 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m206$;
