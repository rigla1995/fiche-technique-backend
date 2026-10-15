-- 247 — Acheteurs professionnels (B2B) et particuliers (B2C) (D2) : type choisi à l’ajout, patente lue pour un professionnel, champs obligatoires selon le type, fiches d’avant « à préciser », facture de vente selon le type.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["acheteurs-carnet","acheteurs-ventes"],"titres":[],"entrees":[],"variantes":[]}

DO $m247$
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
  -- ── acheteurs-carnet ──
  t := $m247_acheteurs_carnet$## 📇 Carnet [[de:acheteur:pl:Nom]]

Le carnet regroupe vos clients, **professionnels (B2B)** ou **particuliers (B2C)**. Chaque fiche porte son type, puis : nom, entreprise (raison sociale), email, téléphone, adresse, **matricule fiscal** et **identifiant RNE** (repris sur les factures) et des notes.

La **remise** n'est plus attachée à la fiche : elle se décide **à chaque commande** ([[nom:vente]] [[acc:vente:manuel:manuelle]] ou validation d'une commande portail).

### Ajouter [[un:acheteur:pl]]

- **➕ Ajouter [[un:acheteur]]** — choisissez d'abord **Professionnel (B2B)** ou **Particulier (B2C)**.
  - **Professionnel** : **📄 Lire la patente** (carte d'identification fiscale, extrait RNE, carte auto-entrepreneur — PDF ou photo, lu sur votre ordinateur, rien n'est envoyé) remplit la raison sociale, le matricule fiscal, le RNE et l'adresse ; vous pouvez aussi les saisir à la main. **Raison sociale, matricule fiscal et adresse sont obligatoires** : la facture de [[nom:vente]] en dépend.
  - **Particulier** : **nom et téléphone** suffisent ; la facture porte ces deux mentions.
  - Le même formulaire sert à la modification (le type se change) ; cochez **Créer le compte portail** pour envoyer une invitation par email.
- **📥 Ajout Dynamique** — import Excel en masse : téléchargez le modèle, remplissez-le et uploadez-le. Colonnes : Nom, Entreprise, Email, Téléphone, Adresse, Matricule fiscal, **Type** (Professionnel ou Particulier) et RNE ; les champs obligatoires sont ceux du type, une ligne incomplète est refusée avec son motif. L'option « Créer les comptes portail » invite chaque ligne ayant un email.

Le compteur du haut affiche votre progression vers le **quota** (ex. 12 / 20). Quota atteint : demandez une augmentation à l'administrateur.

### Fiches « à préciser »

Les fiches créées avant cette version sont classées **professionnelles** si elles ont un matricule fiscal, sinon **« à préciser »** : un bandeau du carnet les compte, et **aucune facture ne peut leur être émise** tant que leur type n'est pas choisi. Ouvrez la fiche (✏️), choisissez le type et complétez les champs obligatoires.

### Comptes portail

Le badge de la colonne « Compte portail » indique l'état :

| Badge | Signification |
| --- | --- |
| Sans compte | fiche seule, pas d'accès en ligne |
| ✉️ Invité | invitation envoyée (valable 48 h), compte pas encore activé |
| ✅ Compte actif | [[le:acheteur]] se connecte et commande sur le portail |

Le bouton ✉️ crée le compte (ou renvoie l'invitation si elle a expiré). L'email d'[[un:acheteur]] **avec compte** ne peut plus être modifié : c'est son identifiant de connexion.

:::attention
Désactiver [[un:acheteur]] (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion, **annule ses commandes encore en attente** (transition tracée dans l'historique des états) et **conserve ses commandes expédiées ou livrées avec leurs factures fiscales** : elles restent dans l'historique avec la mention « (supprimé) », [[le:stock]] ne bouge pas, et le filtre « [[Pl:acheteur]] [[acc:acheteur:supprimés:supprimées]] » de l'écran Commandes permet de les retrouver.
:::
$m247_acheteurs_carnet$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-carnet'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'f425f6bfa8319582c87616d72930ab97';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-carnet'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-carnet'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-carnet' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'acheteurs-carnet'::TEXT; END IF;
  -- ── acheteurs-ventes ──
  t := $m247_acheteurs_ventes$## 🧾 [[Pl:vente]] & commandes [[compl:acheteur:pl]]

### Le cycle de vie d'une commande

| État | Ce qui se passe |
| --- | --- |
| ⏳ En attente | commande envoyée depuis le portail, rien n'est encore déduit |
| 🚚 Expédiée | [[le:stock]] [[compl:labo]] est [[acc:stock:déduit:déduite]], la facture FA- est générée |
| ✅ Livrée | jalon logistique : la date de livraison est enregistrée |
| ✕ Annulée | [[le:stock]] est [[acc:stock:réintégré:réintégrée]] et la facture supprimée |

Chaque commande garde l'**historique complet de ses états** (qui, quand, avec quelle date d'effet) — visible dans le détail.

### [[Nom:vente]] [[acc:vente:manuel:manuelle]] ([[Nom:vente]] [[Court:acheteur]])

Comme [[un:transfert]], mais vers [[un:acheteur]] : choisissez [[det:acheteur:le]]**[[nom:acheteur]]**, [[det:labo:le:court]]**[[court:labo]] source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %**, activez le **timbre fiscal**, puis choisissez l'état initial : **Expédiée** (date d'expédition) ou directement **Livrée** (avec sa date de livraison).

À l'enregistrement, le système :

1. contrôle [[le:stock]] [[compl:labo]] (blocage détaillé si insuffisant) ;
2. déduit [[le:stock]] ([[nom:article:pl]] et [[nom:produit:pl]], en unités) ;
3. fige [[le:cout_matiere:pl]] (PMP TTC) pour [[votre:marge:pl]] ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

Le bloc **« Facturé à »** de la facture suit le type de la fiche : **professionnel (B2B)** — raison sociale et contact, matricule fiscal, identifiant RNE, adresse ; **particulier (B2C)** — nom, mention « Particulier », téléphone.

:::attention
Aucune facture n'est émise à une fiche **« à préciser »** ni à un professionnel **sans matricule fiscal** : complétez la fiche dans le carnet avant [[le:vente]] [[acc:vente:manuel:manuelle]] ou l'expédition d'une commande.
:::

### Commandes du portail

Quand [[un:acheteur]] commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** (badge 🌐 portail). Vos actions :

- **🚚 Expédier** — choisissez [[le:labo]] source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle et la date d'expédition ; [[le:stock]] est [[acc:stock:contrôlé:contrôlée]] puis [[acc:stock:déduit:déduite]] et la facture est générée ; [[le:acheteur]] suit sa commande et récupère sa facture dans « Mes commandes » sur son portail.
- **✅ Livrer** — sur une commande expédiée : enregistrez la date de livraison.
- **↩️ Refuser / Annuler** — avec un motif ; le motif s'affiche [[au:acheteur]] dans « Mes commandes » sur son portail (commandes portail).

### Annulation

Une commande expédiée ou livrée peut être annulée (motif à l'appui) : [[det:stock:le]]**[[nom:stock]] est [[acc:stock:réintégré:réintégrée]] automatiquement** et la facture est supprimée.

:::attention
L'annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L'historique [[du:stock:Nom]] [[Court:labo]] affiche ces mouvements avec le badge **[[Court:vente]]**, et l'export Excel de l'écran Commandes reprend la liste filtrée.
$m247_acheteurs_ventes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-ventes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ac8146a16fdba3ae9a8e07505fe5d726';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-ventes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-ventes'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-ventes' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'acheteurs-ventes'::TEXT; END IF;
  RAISE NOTICE '247 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m247$;
