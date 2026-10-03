-- 194 — Lot 2c : le manuel balisé (docs/lot-2c-spec.md §4.2).
-- Généré par scripts/manuel/generer-migrations.mjs — ne pas éditer à la main.
--
-- Pour chaque fiche qui porte un terme : contenu_defaut reçoit le texte balisé ; contenu aussi, s'il n'a pas été
-- modifié dans l'admin (comparaison sans \r, COALESCE pour les 5 fiches à défaut NULL : R4.2.1, R4.2.2). Garde : md5 du
-- texte d'origine (md5Garde de scripts/manuel/origine/manuel/<slug>.json). Titre et partie : gardés par égalité exacte
-- avec l'origine, champ par champ (R4.2.3). updated_at et mots_cles ne sont pas écrits (R4.2.4, R4.2.6).
-- Idempotente : au 2e passage, la garde ne répond plus et le test « déjà balisée » répond (R4.2.5 : 0 / N / 0).
-- Rendu par défaut de chaque champ = texte d'origine, octet pour octet (I10, controler.mjs point 1, essai-migration.js).
--
-- inventaire : {"contenus":["abonnement","acheteurs-carnet","acheteurs-module","acheteurs-portail","acheteurs-tarifs","acheteurs-ventes","activites","articles-valorises","assistant-ia","calc-cout-recette","calc-ht-ttc","calc-pmp","calc-prix","calc-production-pt","calc-seuils","calc-tracabilite","calc-transferts","calc-valeur-stock","categories-produits","charges","compte","compte-activites-labos","configuration-vente","dashboard","dashboard-gerant","decouvrir-labflow","demarrage","factures","faq","faq-chiffres","fiches-techniques","fournisseurs","gerants","historique","inventaire","lexique","lexique-pt","onboarding-avenants","onboarding-configuration","onboarding-contrat","onboarding-suivi","pertes","produits-utilisables","produits-vendables","rapports","rapports-labo","rapports-vente","referentiel-articles","referentiel-categories","referentiel-familles","referentiel-import","referentiel-unites","roles","saisie-ventes","stock-activites","stock-labo","support","transferts","ventes-labo"],"titres":["acheteurs-carnet","acheteurs-module","acheteurs-portail","acheteurs-tarifs","acheteurs-ventes","activites","articles-valorises","calc-cout-recette","calc-production-pt","calc-transferts","calc-valeur-stock","categories-produits","compte-activites-labos","configuration-vente","dashboard-gerant","factures","fiches-techniques","fournisseurs","gerants","inventaire","lexique-pt","pertes","produits-utilisables","produits-vendables","rapports-labo","rapports-vente","referentiel-articles","saisie-ventes","stock-activites","stock-labo","transferts","ventes-labo"],"parties":["acheteurs-carnet","acheteurs-module","acheteurs-portail","acheteurs-tarifs","acheteurs-ventes","articles-valorises","categories-produits","charges","configuration-vente","factures","fiches-techniques","historique","inventaire","pertes","produits-utilisables","produits-vendables","rapports-labo","rapports-vente","referentiel-articles","referentiel-categories","referentiel-familles","referentiel-import","referentiel-unites","saisie-ventes","stock-activites","stock-labo","transferts","ventes-labo"],"sansTerme":["historique-paiements","onboarding-activation"]}

DO $m194$
DECLARE
  t TEXT;
  n INTEGER;
  balisees INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
  parties_gardees TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── abonnement ──
  t := $m194_abonnement$## 💳 Mon abonnement

Cet écran récapitule votre formule LabFlow : configuration incluse, formule d'activités, option [[Court:acheteur:pl]], tarifs, promotions actives, état du compte et contrat. Vous le trouvez en bas du menu latéral, entrée **Mon abonnement**.

### Ce que vous voyez

Le bandeau rappelle votre date de début d'abonnement et affiche l'**état du compte** :

| État | Signification |
|---|---|
| ✅ Actif | Compte pleinement opérationnel |
| ⚠️ Lecture seule | Paiement en attente — création et modification bloquées |
| 🚫 Suspendu | Compte suspendu, contactez l'administrateur |
| 📦 Archivé | Compte archivé suite à non-paiement |

- **⚙️ Votre configuration** : le nombre [[det:activite:de:pl]]**[[nom:activite:pl]]**, [[det:labo:de:pl]]**[[nom:labo:pl]]** et [[det:gerant:de:pl]]**[[nom:gerant:pl]]** inclus (mention *Non inclus* sinon), la **base [[court:acheteur:pl]]** avec son palier (« jusqu'à N [[nom:acheteur:pl]] ») quand l'option est active, votre **formule d'activités** (badge 📦 *Activité Basique* ou 💎 *Activité Premium*, dès qu'[[un:activite]] est [[acc:activite:inclus:incluse]]), une éventuelle **prolongation** accordée en jours, et le bouton **📄 Contrat actif** qui télécharge votre contrat signé au format PDF (avec sa date).
- **💰 Votre tarification** : le détail de la **tarification mensuelle** poste par poste ([[nom:activite:pl]] selon la formule, [[nom:labo:pl]] et [[nom:gerant:pl]] avec leur prix unitaire en DT, et — si elle est active — la ligne **🤝 Option [[Court:acheteur:pl]]** avec son palier « jusqu'à N [[nom:acheteur:pl]] ») et le **Total mensuel**. Si une promotion s'applique, l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée* et la **période de la promotion** : « Du … au … à ce prix — à partir du lendemain, tarif normal », ou la mention *promotion permanente*. Le cas échéant, la section **Tarification onboarding** affiche les frais d'intégration (montant unique en DT) et leur statut (payé, en attente…).
- Des bandeaux **🏷️ Promotion — Supplément [[Nom:activite]] / [[Nom:labo]] / [[Nom:gerant]]** apparaissent quand une promotion est active sur un supplément : gratuité, pourcentage de réduction ou prix fixe, avec sa date de fin ou la mention *Permanente*.
- **⭐ Passage en formule Premium** : si votre compte est en formule *Activité Basique*, un bouton vous permet de demander le passage en *Premium* ([[Nom:espace_produits]] [[acc:espace_produits:complet:complète]] : [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]], production). La demande est validée par l'équipe LabFlow ; en attendant, la mention ⏳ *Demande en attente* s'affiche.

### Actions pas à pas

1. **Télécharger votre contrat** : cliquez sur *📄 Contrat actif* dans la carte Configuration — le PDF signé s'enregistre sur votre appareil.
2. **Passer en formule Premium** (comptes Basique) : cliquez sur le bouton de demande — dès validation, [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]] se déverrouille.
3. **Demander plus [[de:activite:pl]], [[de:labo:pl]] ou [[de:gerant:pl]]** : la demande de supplément se fait depuis l'écran [[[Nom:activite:pl]]](#activites) (bouton ⚡ quand le quota est atteint) ou via la page [Demandes](#support). Les promotions de supplément affichées ici s'appliqueront au tarif.
4. **Activer l'option [[Court:acheteur:pl]] ou changer de palier** : passez par la page [Demandes](#support) (Ajout de capacité) — un avenant à signer vous est envoyé, et le palier s'applique dès la signature.

### Points d'attention

:::attention
Un retard de paiement fait passer le compte en **lecture seule** (consultation possible, mais plus de saisie), puis peut mener à la suspension. Régularisez votre mensualité pour rétablir l'accès complet.
:::

:::astuce
Vérifiez les bandeaux de promotion avant de demander un supplément : une promotion active peut rendre l'ajout d'[[un:labo]] ou d'[[un:gerant]] temporairement gratuit ou remisé.
:::

### Voir aussi

- [Historique des paiements](#historique-paiements) — mensualités et factures
- [Le contrat d'onboarding](#onboarding-contrat) · [Avenants](#onboarding-avenants)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — ce que couvre l'option
- [[[Nom:activite:pl]] & [[nom:labo:pl]]](#activites) · [Comptes [[nom:gerant:pl]]](#gerants) · [Support](#support)$m194_abonnement$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'abonnement'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '15d723b608750541be9225c8058efeb7';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'abonnement'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'abonnement'::TEXT;
  END IF;
  -- ── acheteurs-carnet ──
  t := $m194_acheteurs_carnet$## 📇 Carnet [[de:acheteur:pl:Nom]]

Le carnet regroupe vos clients B2B. Chaque fiche porte : nom, entreprise, email, téléphone, adresse, **matricule fiscal** (repris sur les factures) et des notes.

La **remise** n'est plus attachée à la fiche : elle se décide **à chaque commande** ([[nom:vente]] [[acc:vente:manuel:manuelle]] ou validation d'une commande portail).

### Ajouter [[un:acheteur:pl]]

- **➕ Ajouter [[un:acheteur]]** — le même formulaire sert à l'ajout et à la modification ; cochez **Créer le compte portail** pour envoyer une invitation par email.
- **📥 Ajout Dynamique** — import Excel en masse : téléchargez le modèle, remplissez-le (seul le Nom est obligatoire) et uploadez-le. L'option « Créer les comptes portail » invite chaque ligne ayant un email.

Le compteur du haut affiche votre progression vers le **quota** (ex. 12 / 20). Quota atteint : demandez une augmentation à l'administrateur.

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
:::$m194_acheteurs_carnet$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-carnet'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'f24faf3d5f21f80ac751b42b9afaf09a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-carnet'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-carnet'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Carnet [[de:acheteur:pl:Nom]]' WHERE slug = 'acheteurs-carnet' AND titre = 'Carnet d''Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-carnet' AND titre = 'Carnet [[de:acheteur:pl:Nom]]') THEN titres_gardes := titres_gardes || 'acheteurs-carnet'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-carnet' AND partie = 'Espace Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-carnet' AND partie = '[[Nom:espace_acheteurs]]') THEN parties_gardees := parties_gardees || 'acheteurs-carnet'::TEXT; END IF;
  -- ── acheteurs-module ──
  t := $m194_acheteurs_module$## 🤝 Le module [[Court:acheteur:pl]]

Le module [[Court:acheteur:pl]] transforme [[votre:labo]] en **point de vente B2B** : vous gérez un carnet [[de:acheteur:pl]] (restaurants, superettes, grossistes…), vous leur vendez [[un:article:pl]] et [[un:produit:pl]] depuis [[det:stock:votre]]**[[nom:stock]] [[compl:labo]]**, et chaque [[nom:vente]] génère une **facture fiscale** numérotée.

Il permet aussi le **compte [[nom:depot]]** : un compte LabFlow composé uniquement d'[[un:labo]] et d'un carnet [[de:acheteur:pl]], sans [[aucun:activite]].

### Activation

Le module est **optionnel** et désactivé par défaut. Deux façons de l'activer :

1. Depuis l'écran verrouillé [[du:espace_acheteurs:Nom]], envoyez une **demande d'activation** — l'administrateur la valide sous 24 h.
2. L'administrateur peut l'activer directement sur votre compte.

À l'activation, un **quota [[de:acheteur:pl]]** est défini sur votre abonnement : c'est le nombre maximum de fiches dans votre carnet. Pour l'augmenter, contactez l'administrateur.

### Ce que le module ajoute

| Élément | Rôle |
| --- | --- |
| Carnet [[de:acheteur:pl:Nom]] | vos clients B2B (fiches, comptes portail) |
| Tarifs [[Court:acheteur:pl]] | les articles proposés et leurs prix HT (+ TVA) |
| [[Nom:vente]] [[Court:acheteur]] | [[le:vente]] [[acc:vente:manuel:manuelle]] depuis [[le:stock]] [[compl:labo]] |
| Commandes | le suivi [[du:vente:pl]] et des commandes du portail |
| Portail [[court:acheteur]] | l'espace où [[votre:acheteur:pl]] commandent en ligne |

:::regle
[[Tous:vente:les]] [[au:acheteur:pl]] partent [[det:stock:du]]**[[nom:stock]] [[compl:labo]]** (jamais [[du:stock]] d'[[un:activite]]). [[Le:labo]] source est [[acc:labo:choisi:choisie]] à chaque [[nom:vente]], et la **remise** éventuelle se décide à chaque commande.
:::$m194_acheteurs_module$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-module'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '5b3bb1a63ae1594047e25145459795ba';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-module'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-module'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Le module [[Court:acheteur:pl]]' WHERE slug = 'acheteurs-module' AND titre = 'Le module Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-module' AND titre = 'Le module [[Court:acheteur:pl]]') THEN titres_gardes := titres_gardes || 'acheteurs-module'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-module' AND partie = 'Espace Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-module' AND partie = '[[Nom:espace_acheteurs]]') THEN parties_gardees := parties_gardees || 'acheteurs-module'::TEXT; END IF;
  -- ── acheteurs-portail ──
  t := $m194_acheteurs_portail$## 🛍️ Le portail [[court:acheteur]]

Le portail est l'espace en ligne de **[[votre:acheteur:pl]]** (adresse `/portail`, accessible après activation de leur compte).

### Ce que voit [[le:acheteur]]

- Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtre et pagination, et les prix TTC à l'unité. Tout article proposé est **commandable** — [[le:acheteur]] ne voit **rien de [[votre:stock:pl]]** : c'est vous qui ajustez les quantités, ou retirez des lignes, à l'expédition.
- **Mes commandes** : le statut de chaque commande (En attente / Expédiée / Livrée / Annulée avec motif), le **détail complet** (lignes, remise appliquée, TVA, timbre, total, référence de facture) et l'**historique des états**, avec les **factures** en PDF.

### Le flux

1. [[Le:acheteur]] compose son panier et envoie sa commande — **les prix sont figés** au tarif du moment, [[acc:acheteur:il:elle]] ne peut pas les modifier.
2. Vous recevez la notification et **expédiez** (ou refusez) depuis [Commandes](#acheteurs-ventes) — c'est à l'expédition que vous pouvez **ajuster les quantités** et décider d'une **remise** éventuelle.
3. [[Le:stock]] n'est [[acc:stock:déduit:déduite]] **qu'à l'expédition** — aucune réservation avant.
4. [[Le:acheteur]] retrouve le nouveau statut et sa facture sur son portail ; vous clôturez la commande en la passant **Livrée**.

:::astuce
Une commande n'engage pas [[votre:stock]] : à l'expédition, vous ajustez les quantités réellement servies, retirez les lignes que vous ne pouvez pas fournir, ou refusez la commande avec un motif.
:::

### Les emails reçus par [[un:acheteur]]

[[Un:acheteur]] ne reçoit **que deux emails** : l'invitation à activer son compte, et la réinitialisation de son mot de passe. Les changements de statut d'une commande (expédiée, livrée, refusée) **ne déclenchent aucun email** : [[le:acheteur]] les consulte dans « Mes commandes » sur son portail.$m194_acheteurs_portail$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-portail'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '33657a154190d5b972aa74f9600491c3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-portail'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-portail'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Le portail [[court:acheteur]]' WHERE slug = 'acheteurs-portail' AND titre = 'Le portail acheteur';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-portail' AND titre = 'Le portail [[court:acheteur]]') THEN titres_gardes := titres_gardes || 'acheteurs-portail'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-portail' AND partie = 'Espace Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-portail' AND partie = '[[Nom:espace_acheteurs]]') THEN parties_gardees := parties_gardees || 'acheteurs-portail'::TEXT; END IF;
  -- ── acheteurs-tarifs ──
  t := $m194_acheteurs_tarifs$## 💲 Tarifs [[Court:acheteur:pl]]

Cet écran définit **ce que vous proposez** à [[votre:acheteur:pl]] et à quel prix. Le tarif est le même pour [[tous:acheteur:les]] — la personnalisation passe par la **remise** saisie à chaque commande.

### Qui est proposable ?

- **[[Nom:article:pl]]** [[acc:article:marqué:marquée:pl]] **Commandable** (interrupteur violet dans la page [[[Pl:article]]](#referentiel-articles), visible quand le module est actif).
- **[[Nom:produit_compose:pl]]** [[acc:produit_compose:fabriqué:fabriquée:pl]] [[au:labo]] (section « [[Titre:produit_compose:pl]] »).
- **[[Nom:produit_utilisable:pl]]** [[acc:produit_utilisable:rattaché:rattachée:pl]] à au moins [[un:labo]] (section « [[Titre:produit_utilisable:pl]] »).

Les articles sont regroupés **par catégorie** (sections repliées par défaut) ; la recherche et les filtres aident à retrouver une ligne.

### Le prix

Chaque offre porte un **prix HT à l'unité** et son **taux de TVA** — le prix TTC correspondant s'affiche automatiquement. [[Le:vente]] se fait toujours à l'unité (pas de lots).

:::regle
Une offre ne peut être **Proposée** (active) que si son prix unitaire HT est supérieur à 0. Chaque changement de prix est historisé.
:::

:::astuce
Seules les offres **actives** apparaissent dans [[le:vente:Nom]] [[Court:acheteur]] et sur le portail. Désactivez une offre pour la retirer du catalogue sans perdre ses prix.
:::

### Faire une promotion

Dans **Tarifs [[Court:acheteur:pl]]**, chaque ligne dispose d'un taux **Promo %** et d'un interrupteur **Promo active**. Une fois la promotion activée :

- [[votre:acheteur:pl]] voient sur le portail le **prix initial barré** et le nouveau prix, avec un badge « −X % » ;
- le prix promotionnel est celui **réellement facturé** — il est aussi proposé par défaut quand vous saisissez [[un:vente]] [[acc:vente:manuel:manuelle]] ;
- le **prix de référence n'est pas écrasé** : coupez la promotion et le tarif normal revient immédiatement, le taux saisi restant mémorisé pour la prochaine fois ;
- les commandes **déjà passées ne changent pas** : leur prix a été figé au moment de la commande.$m194_acheteurs_tarifs$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-tarifs'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'f2541a89832553ab8834d0372cb3ab7a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-tarifs'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-tarifs'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Tarifs [[Court:acheteur:pl]]' WHERE slug = 'acheteurs-tarifs' AND titre = 'Tarifs Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-tarifs' AND titre = 'Tarifs [[Court:acheteur:pl]]') THEN titres_gardes := titres_gardes || 'acheteurs-tarifs'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-tarifs' AND partie = 'Espace Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-tarifs' AND partie = '[[Nom:espace_acheteurs]]') THEN parties_gardees := parties_gardees || 'acheteurs-tarifs'::TEXT; END IF;
  -- ── acheteurs-ventes ──
  t := $m194_acheteurs_ventes$## 🧾 [[Pl:vente]] & commandes [[compl:acheteur:pl]]

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

L'historique [[du:stock:Nom]] [[Court:labo]] affiche ces mouvements avec le badge **[[Court:vente]]**, et l'export Excel de l'écran Commandes reprend la liste filtrée.$m194_acheteurs_ventes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'acheteurs-ventes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'c5d2962271340f16066234b6679cd2f4';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-ventes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'acheteurs-ventes'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Pl:vente]] & commandes [[compl:acheteur:pl]]' WHERE slug = 'acheteurs-ventes' AND titre = 'Ventes & commandes acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-ventes' AND titre = '[[Pl:vente]] & commandes [[compl:acheteur:pl]]') THEN titres_gardes := titres_gardes || 'acheteurs-ventes'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-ventes' AND partie = 'Espace Acheteurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'acheteurs-ventes' AND partie = '[[Nom:espace_acheteurs]]') THEN parties_gardees := parties_gardees || 'acheteurs-ventes'::TEXT; END IF;
  -- ── activites ──
  t := $m194_activites$## 🏢 [[Nom:activite:pl]] & [[nom:labo:pl]]

Cet écran vous permet de créer et gérer [[det:activite:votre:pl]]**[[nom:activite:pl]]** (points de vente) et [[det:labo:votre:pl]]**[[nom:labo:pl]]** de production, dans la limite de votre abonnement. Vous le trouvez dans le menu latéral, entrée **[[Mon:activite:pl]]**. Un compte peut gérer [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], avec ou sans [[nom:labo]][[acc:labo: central:]].

### Ce que vous voyez

Le bandeau affiche vos **compteurs de quota** : [[nom:activite:pl]] [[acc:activite:utilisé:utilisée:pl]] / [[acc:activite:inclus:incluse:pl]], et [[nom:labo:pl]] [[acc:labo:utilisé:utilisée:pl]] / [[acc:labo:inclus:incluse:pl]] si votre abonnement en prévoit ; si votre domaine distingue plusieurs types d'unités (Restaurant, Bar, Cuisine, Économat…), la répartition par type s'affiche à titre indicatif et chaque fiche porte un badge de type. Une barre de recherche filtre [[nom:activite:pl]] et [[nom:labo:pl]] par nom.

- **Section [[Pl:activite]]** : un tableau avec le *Nom*, l'*Adresse*, [[det:labo:le]]*[[Nom:labo]]* qui l'alimente (pastille 🏭 cliquable qui ouvre la fiche [[du:labo]]) et les boutons ✏️ modifier / 🗑 supprimer. Le bouton **+ [[Nouveau:activite]]** est remplacé par **⚡ Ajouter [[pl:activite]]** quand le quota est atteint : il ouvre alors une demande de supplément auprès du support.
- **Section Espace [[Court:labo:pl]]** (si votre abonnement inclut au moins [[un:labo]]) : tableau *Nom*, *Réf.*, *Adresse*, avec **+ [[Nouveau:labo]]** ou **⚡ Ajouter [[pl:labo]]** au quota atteint.

À la toute première visite, quand rien n'existe encore, un écran de démarrage propose **✨ Créer mon business** (si [[un:labo]] est [[acc:labo:inclus:incluse]]) ou **+ Ajouter [[mon:activite]]**.

### Actions pas à pas

1. **Premier démarrage avec le wizard « Créer mon business »** : à l'étape *[[Nom:labo_long]]*, saisissez le nom, la référence (unique) et l'adresse [[du:labo]] — ou cochez *Passer cette étape*. À l'étape *[[Pl:activite]]*, remplissez un bloc par [[nom:activite]] (nom obligatoire, adresse, choix **Avec [[nom:labo]]** / **Sans [[nom:labo]]**), ajoutez des blocs avec *+ Ajouter [[un:activite]]* dans la limite du quota, puis validez avec **✅ Enregistrer tout**.
2. **Créer [[un:activite]]** : *+ [[Nouveau:activite]]* → nom (un doublon de nom est signalé immédiatement), adresse facultative. Si [[un:labo:pl]] existent, choisissez **Avec [[nom:labo]]** (puis sélectionnez [[acc:labo:lequel:laquelle]] : c'est [[le:labo]] qui l'alimente) ou **Sans [[nom:labo]]** (gestion autonome). Si votre domaine propose plusieurs types [[de:activite:pl]], choisissez aussi le **type** (Restaurant, Bar…) : il préconfigure [[le:vente]] et la production de l'unité. Quand tous les emplacements prévus par votre abonnement sont créés, LabFlow vous emmène automatiquement vers [[le:referentiel:Nom]] (page Unités) pour créer [[votre:article:pl]].
3. **Créer [[un:labo]]** : nom, **référence unique** (demandée uniquement à la création), adresse, et le champ **[[acc:labo:Alimenté:Alimentée]] par** pour désigner [[acc:labo:un autre:une autre]] [[nom:labo]] qui l'approvisionne (un économat alimente une cuisine, par exemple ; les boucles sont refusées) ; vous pouvez cocher directement [[le:activite:pl]] sans [[nom:labo]] à lui rattacher.
4. **Modifier** [[un:activite]] ou [[un:labo]] avec ✏️ ; le rattachement d'[[un:activite]] (« [[acc:activite:Alimenté:Alimentée]] par ») ou la source d'[[un:labo]] (« [[acc:labo:Alimenté:Alimentée]] par ») se change dans la même fenêtre.

### Points d'attention

:::attention
La suppression est bloquée (message 🔒) tant que [[un:article:pl]] sont [[acc:article:affecté:affectée:pl]] [[au:activite]] ou [[au:labo]] : retirez d'abord [[ce:article:pl]]. La suppression d'[[un:labo]] fait passer [[son:activite:pl]] en gestion séparée, retire leur source [[au:labo:pl]] qu'[[acc:labo:il:elle]] alimentait et met fin [[au:transfert:pl]] depuis [[ce:labo]] ; elle est refusée tant que [[ce:labo]] a émis ou reçu [[un:transfert:pl]]. Ces suppressions sont irréversibles.
:::

:::astuce
Rattacher [[un:activite]] à [[un:labo]] signifie que [[son:pt:pl]] d'origine [[nom:labo]] arriveront uniquement par [[nom:transfert]] — c'est le mode de fonctionnement recommandé quand vous produisez en central ; [[un:labo]] peut [[acc:labo:lui:elle]] aussi être [[acc:labo:alimenté:alimentée]] par [[acc:labo:un autre:une autre]] [[nom:labo]] : [[le:article:pl]] [[acc:article:reçu:reçue:pl]] entrent à [[son:stock]] au prix de cession et servent de base au coût de ses productions.
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos) — le modèle général
- [[[Nom:transfert:pl]] [[compl:labo]] → [[nom:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts)
- [[[Nom:article:pl]] [[du:referentiel]]](#referentiel-articles) — l'affectation [[du:article:pl]] par [[nom:activite]]
- [Mon abonnement](#abonnement) · [Comptes [[court:gerant:pl]]](#gerants)$m194_activites$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'activites'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'cdc496c97ba75b9940a30554de85b9b3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'activites'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'activites'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:activite:pl]] & [[nom:labo:pl]]' WHERE slug = 'activites' AND titre = 'Activités & labos';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'activites' AND titre = '[[Nom:activite:pl]] & [[nom:labo:pl]]') THEN titres_gardes := titres_gardes || 'activites'::TEXT; END IF;
  -- ── articles-valorises ──
  t := $m194_articles_valorises$## 💎 [[Titre:produit_valorise:pl]]

[[Le:produit_valorise:pl]] sont **[[acc:produit_valorise:vendus tels quels:vendues telles quelles]]**, sans décomposition en [[nom:ingredient:pl]] [[au:vente]]. Vous les gérez depuis le menu **Espace [[Pl:produit]] → [[Titre:produit_valorise:pl]]**. [[acc:produit_valorise:Ils:Elles]] sont de deux natures : [[det:article:le:pl]]**[[nom:article:pl]] [[du:referentiel]]** à catégoriser (boissons en bouteille, [[nom:produit:pl]] [[acc:produit:revendu:revendue:pl]] en l'état) et [[det:produit_compose:le:pl]]**[[nom:produit_compose:pl]] [[acc:produit_compose:fabriqué:fabriquée:pl]] [[au:labo]]** (cookie maison, pâtisserie…).

### Ce que vous voyez

- Un bandeau avec le compteur **« X/Y [[nom:article:pl]] [[acc:article:catégorisé:catégorisée:pl]] »**.
- Deux onglets : **🏭 Composés** (visible uniquement si vous avez au moins [[un:labo]]) et **💎 [[Nom:referentiel]]**.
- Onglet **[[Nom:referentiel]]** : filtres **🔍 [[Nom:article]]**, **🗂️ Famille** et **🏷️ Statut** (Tous / [[acc:article:Catégorisé:Catégorisée:pl]] / Non [[acc:article:catégorisé:catégorisée:pl]]) ; [[le:article:pl]] sont **[[acc:article:regroupé:regroupée:pl]] par catégorie [[de:article]]**, avec un tableau à deux colonnes — **[[Nom:article]]** (et son unité) et **Catégorie [[court:produit]]** (liste déroulante). La liste est paginée par 10 catégories.
- Onglet **Composés** : filtres **🔍 [[Nom:produit]]** (nom ou référence) et **🏷️ Catégorie**, bouton **+ [[Nom:produit_valorise]] [[acc:produit_valorise:composé:composée]]**, puis des cartes 💎 avec badge de catégorie, bouton **👁 Voir composition**, actions (**📄 Fiche technique (XLS)**, **✏️ Modifier**, **🗑**) et pastilles **[[Pl:activite]]** / **[[Pl:labo]]** (12 cartes par page).

### Actions pas à pas

**Catégoriser [[un:article]] [[du:referentiel]]**

1. Ouvrez l'onglet **[[Nom:referentiel]]** et retrouvez [[le:article]] via les filtres.
2. Sélectionnez sa **catégorie [[court:produit]]** (de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] ») dans la liste déroulante : l'enregistrement est **immédiat**. Un liseré rouge signale [[le:article:pl]] encore sans catégorie.

**Créer [[un:produit_valorise]] [[acc:produit_valorise:composé:composée]]**

1. Dans l'onglet **Composés**, cliquez sur **+ [[Nom:produit_valorise]] [[acc:produit_valorise:composé:composée]]** : un assistant en 5 étapes s'ouvre.
2. **Affectation** — choisissez [[acc:labo:le:la]] ou [[det:labo:le:pl]]**[[court:labo:pl]] de fabrication** ; [[le:activite:pl]] [[acc:activite:rattaché:rattachée:pl]] sont [[acc:activite:pré-coché:pré-cochée:pl]] et **recevront [[le:produit]] par [[nom:transfert]]** (décochez pour exclure).
3. **Identité** — nom (obligatoire), référence, **catégorie de type valorisé** (obligatoire).
4. **[[Pl:article]]** puis **[[Titre:produit_utilisable:pl]]** — composez [[le:recette]] à partir [[du:article:pl]] et [[court:produit_utilisable:pl]] du périmètre [[compl:labo]] (au moins un composant avec [[nom:portion]]).
5. **Récap** — vérifiez puis validez avec **Créer [[le:produit]] ✓**.

**Générer [[le:fiche_technique]] d'un composé** : cliquez sur **📄 Fiche technique (XLS)**. Le coût est calculé sur les **prix [[de:appro]] [[du:labo]]** de fabrication ; si [[le:produit]] est [[acc:produit:fabriqué:fabriquée]] dans plusieurs [[nom:labo:pl]], cochez directement les bases souhaitées dans la fenêtre — un fichier Excel est généré **par [[nom:labo]] [[acc:labo:sélectionné:sélectionnée]]** (voir [[[Titre:fiche_technique:pl]]](#fiches-techniques)).

### Points d'attention

:::regle
[[Le:article:pl]] valorisables proviennent des familles marquées **« vendable »** et **« non consommable »** dans [[det:referentiel:votre]][[[nom:referentiel]]](#referentiel-familles). [[Un:article]] sans catégorie [[court:produit]] n'apparaît pas dans la configuration [[de:vente]].
:::

:::attention
Si aucune catégorie de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] » n'existe, un avertissement s'affiche : créez-la d'abord dans [Catégories [[Court:produit:pl]]](#categories-produits).
:::

:::regle
Un composé valorisé est fabriqué [[au:labo]] et rejoint [[le:stock]] [[du:activite:pl]] **uniquement par [[nom:transfert]]**. Son prix est **figé au moment de chaque production** [[au:labo]] (voir [Production d'[[un:pt]]](#calc-production-pt)).
:::

:::astuce
Cocher une pastille [[de:activite]] sur un composé l'inscrit directement [[det:stock:au]]**[[nom:stock]] de [[ce:activite]]** en mode [[nom:transfert]] : pensez-y avant [[acc:transfert:votre premier:votre première]] [[nom:transfert]].
:::

### Voir aussi

- [Catégories [[Court:produit:pl]]](#categories-produits)
- [[[Nom:referentiel]] — familles](#referentiel-familles) et [[[nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[court:labo]]](#stock-labo) et [[[Nom:transfert:pl]]](#transferts)
- [Production d'[[un:pt]]](#calc-production-pt)
- [[[Titre:fiche_technique:pl]]](#fiches-techniques)$m194_articles_valorises$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'articles-valorises'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'fc2df8ef58cbae82270d344b8252c460';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'articles-valorises'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'articles-valorises'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Titre:produit_valorise:pl]]' WHERE slug = 'articles-valorises' AND titre = 'Produits Valorisés';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'articles-valorises' AND titre = '[[Titre:produit_valorise:pl]]') THEN titres_gardes := titres_gardes || 'articles-valorises'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_produits]]' WHERE slug = 'articles-valorises' AND partie = 'Espace Produit';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'articles-valorises' AND partie = '[[Nom:espace_produits]]') THEN parties_gardees := parties_gardees || 'articles-valorises'::TEXT; END IF;
  -- ── assistant-ia ──
  t := $m194_assistant_ia$## 🤖 Assistant IA

L'assistant IA de LabFlow répond en langage naturel à vos questions sur **vos données** ([[nom:stock]], [[nom:perte:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]], coûts) et sur **le fonctionnement de LabFlow** : il connaît ce manuel et peut vous guider pas à pas. Il s'affiche via le bouton 🤖 de la barre du haut (à côté de la cloche de notifications) **pendant votre mise en route** : le panneau montre l'avancement de votre configuration étape par étape (vos unités par type — par exemple « 1/2 Restaurant · 0/1 Cuisine » selon votre domaine —, [[nom:referentiel]], [[nom:article:pl]], [[nom:fournisseur:pl]], [[nom:produit:pl]], premières saisies, carnet [[de:acheteur:pl]] si le module est actif), avec des questions suggérées pour l'étape en cours. Une fois votre configuration terminée, le guide se retire automatiquement — et il revient de lui-même si un avenant ajoute de nouvelles capacités à configurer ([[nom:activite]], [[nom:labo]], module [[Court:acheteur:pl]]…). Le chat s'ouvre par-dessus votre écran, sans vous faire quitter la page en cours.

### Ce que vous voyez

- Le bouton 🤖 de la barre du haut, visible pendant votre mise en route : un clic ouvre ou referme le guide, et la conversation reste affichée pendant que vous naviguez d'une page à l'autre.
- Un en-tête « Assistant IA LabFlow » qui rappelle sa mission : analyser vos données ([[nom:stock]], [[nom:vente:pl]], [[nom:perte:pl]]…) et répondre à vos questions sur le fonctionnement de LabFlow.
- La conversation sous forme de bulles : vos messages d'un côté, les réponses de l'assistant de l'autre.
- À la première visite, des suggestions cliquables pour démarrer : « [[acc:stock:Quel:Quelle]] est [[mon:stock]] critique actuellement ? », « Comment réduire [[mon:perte:pl]] ? », « Comment fonctionnent [[le:transfert:pl]] [[nom:labo]] → [[nom:activite:pl]] ? », « Comment la valeur de [[mon:stock]] est-elle calculée ? ».
- Une zone de saisie en bas de page, avec un bouton d'envoi.
- Un bouton **Effacer**, en haut de la conversation dès qu'elle contient des messages, pour repartir de zéro.

Votre conversation est conservée : si vous quittez la page et revenez plus tard, vous retrouvez l'historique de vos échanges.

### Actions pas à pas

**Poser une question**

1. Tapez votre question dans la zone de saisie, comme vous la poseriez à un collaborateur.
2. Appuyez sur **Entrée** pour envoyer — utilisez **Maj+Entrée** pour aller à la ligne sans envoyer.
3. L'assistant analyse vos données et répond directement dans la conversation.

**Exemples de questions utiles**

- Sur vos données : « [[acc:stock:Quel:Quelle]] est [[mon:stock]] critique actuellement ? », « [[acc:perte:Quels:Quelles]] ont été mes plus [[acc:perte:gros:grosses]] [[nom:perte:pl]] ce mois-ci ? », « Analyse [[mon:inventaire:pl]] [[acc:inventaire:récent:récente:pl]] », « [[acc:article:Quels:Quelles]] [[nom:article:pl]] devrais-je réapprovisionner en priorité ? »
- Sur LabFlow : « Comment déclarer [[un:perte]] ? », « Comment fonctionne [[un:transfert]] entre [[nom:labo]] et [[nom:activite]], ou entre deux [[nom:labo:pl]] ? », « Où retrouver mes factures ? » — l'assistant s'appuie sur ce manuel pour vous répondre.

**Effacer la conversation**

1. Cliquez sur **Effacer** en haut de la conversation.
2. L'historique est supprimé et une nouvelle conversation démarre.

### Points d'attention

:::attention
Si la page affiche « Assistant IA non activé », l'assistant n'est pas encore ouvert pour votre compte : contactez l'administration, par exemple via une [demande d'aide](#support), pour l'activer.
:::

:::astuce
Selon la configuration de votre compte, l'assistant peut aussi être joignable depuis Facebook Messenger : pratique pour l'interroger en cuisine, sans ouvrir LabFlow. Ce raccordement est mis en place par l'administration.
:::

:::regle
L'assistant n'analyse que les données de votre propre compte LabFlow. Ses réponses sont une aide à la décision : les chiffres de référence restent ceux de vos écrans et de vos [rapports](#rapports).
:::

### Voir aussi

- [Demandes et support](#support) — pour les demandes qui nécessitent une action de l'équipe LabFlow
- [Questions fréquentes](#faq) — les réponses aux questions les plus courantes
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites), [[[Nom:perte:pl]]](#pertes), [Rapports](#rapports)$m194_assistant_ia$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'assistant-ia'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '8f4045db4a93a85969c7e2febc6d1e22';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'assistant-ia'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'assistant-ia'::TEXT;
  END IF;
  -- ── calc-cout-recette ──
  t := $m194_calc_cout_recette$## 🧮 Le coût de revient d'[[un:recette]]

Le coût de revient d'[[un:fiche_technique]] est la somme de ce que coûtent ses composants : chaque [[nom:ingredient]] compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son prix unitaire TTC, et chaque sous-produit transformé compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans [[le:recette]] du sous-produit, puis de ses éventuels sous-produits, jusqu'[[acc:ingredient:au dernier:à la dernière]] [[nom:ingredient]].

### Les paramètres qui influencent le résultat

- **[[Le:portion:pl]] [[du:recette]]** : la quantité de chaque [[nom:ingredient]] et de chaque sous-produit nécessaire pour une unité produite.
- **Le prix unitaire de chaque [[nom:ingredient]]**, selon le mode choisi au moment de générer [[le:fiche_technique]] (carte *[[Court:fiche_technique]] [[Court:stock]]* avec ses méthodes *DP* / *PMP*, ou carte *[[Court:fiche_technique]] Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]], côté [[nom:activite]]) depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour [[le:article]].
  - **Prix manuel** — carte *[[Court:fiche_technique]] Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.
- **La base de prix choisie** : [[le:fiche_technique]] se génère pour une ou plusieurs bases ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:assigné:assignée:pl]] [[au:produit]]) — les prix proviennent [[du:stock]] de chaque base, avec repli sur les prix [[du:labo]] [[acc:labo:lié:liée]] quand [[un:article]] n'a pas encore de prix côté [[nom:activite]]. [[Un:produit]] [[acc:produit:fabriqué:fabriquée]] [[au:labo]] se calcule uniquement sur ses bases [[nom:labo]].
- **[[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]]** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions [[de:stock]] suivent ces quantités, sans modifier [[le:fiche_technique]] (l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard).

:::formule Coût de revient d'[[un:recette]]
Coût total = somme([[nom:portion]] [[nom:ingredient]] × prix unitaire TTC) + somme([[nom:portion]] sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
[[Nom:recette]] « Tarte aux fraises » (pour 1 tarte), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] :

- Farine : 0,250 kg × 2,400 DT/kg = 0,600 DT
- Fraises : 0,300 kg × 8,000 DT/kg = 2,400 DT
- Sucre : 0,100 kg × 3,200 DT/kg = 0,320 DT
- Crème pâtissière (sous-produit) : 0,500 unité × 4,440 DT/unité = 2,220 DT

Le coût de la crème pâtissière (4,440 DT) est lui-même calculé à partir de [[acc:recette:son propre:sa propre]] [[nom:recette]] : lait 0,500 L × 2,000 DT = 1,000 DT ; œufs 4 pièces × 0,700 DT = 2,800 DT ; sucre 0,200 kg × 3,200 DT = 0,640 DT.

**Coût de revient de la tarte = 0,600 + 2,400 + 0,320 + 2,220 = 5,540 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- [[Un:inventaire]] redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si [[un:ingredient]] n'a encore aucun prix connu (jamais [[acc:ingredient:approvisionné:approvisionnée]]), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d'une ligne [[de:appro]] passée change le PMP, donc le coût, rétroactivement.
- [[Un:recette]] ne peut pas se contenir [[acc:recette:lui-même:elle-même]] (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [[[Nom:fiche_technique:pl]]](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d'[[un:pt]]](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique [[un:pt:pl]]](#lexique-pt)$m194_calc_cout_recette$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-cout-recette'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'cc4f28f13816d5c2a5c6faf579fcb9aa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-cout-recette'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-cout-recette'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Coût de revient d''[[un:recette]]' WHERE slug = 'calc-cout-recette' AND titre = 'Coût de revient d''une recette';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-cout-recette' AND titre = 'Coût de revient d''[[un:recette]]') THEN titres_gardes := titres_gardes || 'calc-cout-recette'::TEXT; END IF;
  -- ── calc-ht-ttc ──
  t := $m194_calc_ht_ttc$## 🧾 HT et TTC dans LabFlow

Les prix d'achat se saisissent en **hors taxes (HT)**, accompagnés du **taux de TVA** en pourcentage. LabFlow calcule alors le prix TTC de la ligne et le conserve avec elle. Tout l'affichage courant — [[nom:stock:pl]], coûts [[de:recette]], productions, [[nom:transfert:pl]], [[nom:perte:pl]], rapports et tableaux de bord — est ensuite exprimé en **TTC** : c'est le coût réellement décaissé.

### Les paramètres qui influencent le résultat

- **Le prix unitaire HT** saisi [[au:appro]].
- **Le taux de TVA** choisi pour la ligne (en %).
- **La nature de la ligne** : [[le:pt:pl]] sont conventionnellement à TVA 0, donc pour [[acc:pt:eux:elles]] HT = TTC (leur coût est déjà composé de prix TTC [[de:ingredient:pl]]).

:::formule Passage du HT au TTC
Prix TTC = Prix HT × (1 + taux de TVA ÷ 100)
note: calculé et enregistré ligne par ligne, au moment de la saisie [[du:appro]].
:::

:::exemple
Vous recevez 10,000 kg de farine à 2,100 DT HT le kg, avec une TVA de 19 % :

- Prix unitaire TTC = 2,100 × (1 + 19 ÷ 100) = 2,100 × 1,19 = **2,499 DT le kg**
- Coût HT de la ligne = 10,000 × 2,100 = 21,000 DT
- Montant de TVA = 21,000 × 19 % = 3,990 DT
- Coût TTC de la ligne = 10,000 × 2,499 = **24,990 DT**

C'est ce prix de 2,499 DT TTC qui entrera dans le PMP de la farine, dans la valeur [[du:stock]] et dans les coûts [[de:recette]].
:::

### Où voit-on encore du HT ?

Le HT reste visible partout où il a une utilité comptable :

- **Les factures** : montant HT, montant de TVA, montant TTC (et timbre fiscal éventuel).
- **Les exports Excel détaillés de l'historique [[un:appro:pl]]** : colonnes prix unitaire HT, taux de TVA, prix unitaire TTC, coût HT et coût TTC.
- **Les historiques [[de:appro:pl]]** : chaque ligne affiche côte à côte le prix HT, le taux de TVA et le prix TTC.
- **La colonne valeur des pages [[de:stock]]** ([[nom:activite:pl]] et [[nom:labo]]) : la valeur TTC en évidence, la valeur HT rappelée en dessous.

### Ce qui peut faire varier le résultat

- Un taux de TVA à 0 % donne un TTC égal au HT.
- Pour les saisies anciennes où la TVA n'était pas renseignée, le TTC est considéré égal au HT.
- [[Le:pt:pl]] sont toujours à TVA 0 : leur prix affiché est le même en HT et en TTC.
- Deux achats au même prix HT mais à des taux différents donnent des TTC différents : le PMP TTC en tient compte.
- [[Le:transfert:pl]] vers [[un:activite]] sont [[acc:transfert:valorisé:valorisée:pl]] au prix de cession TTC saisi au moment [[du:transfert]], proposé par défaut au prix [[du:labo]].

### Voir aussi

- [Factures](#factures)
- [Historique [[un:appro:pl]]](#historique)
- [Rapports](#rapports)
- [Le prix moyen pondéré](#calc-pmp)
- [Lexique](#lexique)$m194_calc_ht_ttc$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-ht-ttc'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '0c5a4f69078f10a26d222c52227fff46';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-ht-ttc'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-ht-ttc'::TEXT;
  END IF;
  -- ── calc-pmp ──
  t := $m194_calc_pmp$## ⚖️ Le prix moyen pondéré (PMP)

Le PMP d'[[un:article]] est son coût unitaire moyen réel, pondéré par les quantités reçues. Il est calculé sur les **entrées valorisées depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** : les achats saisis à la main et, côté [[nom:activite]], [[le:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] [[du:labo]] (au prix de cession TTC [[du:transfert]], proposé par défaut au prix [[du:labo]]). Tous les prix sont pris en TTC.

Le PMP n'est **jamais figé** : il n'est stocké nulle part, il est recalculé en direct à partir des lignes [[de:appro]] à chaque affichage. C'est lui qui valorise [[le:stock]], les coûts [[de:recette]] et les déductions [[de:ingredient:pl]] à la production.

### Les paramètres qui influencent le résultat

- **Les achats depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** : quantité et prix TTC de chaque ligne.
- **[[Le:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] [[du:labo]]** (côté [[nom:activite]] uniquement), [[acc:transfert:compté:comptée:pl]] au prix de cession TTC [[du:transfert]] — proposé par défaut au prix [[du:labo]], ajustable à l'envoi.
- **La date [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]]**, qui borne la période de calcul.
- **Le repli [[compl:labo]]** : si [[le:activite]] n'a encore reçu [[aucun:appro]] d'[[un:article]], le coût [[de:recette]] utilise le PMP [[du:labo]] [[acc:labo:lié:liée]].

:::formule Prix moyen pondéré
PMP = somme(quantité × prix unitaire TTC) ÷ somme(quantités)
note: sur les achats et [[nom:transfert:pl]] reçus à quantité positive depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] ; [[au:labo]], sur les achats uniquement.
:::

:::exemple
Farine dans [[un:activite]], depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] :

- Achat du 02/07 : 10,000 kg × 2,300 DT/kg = 23,000 DT
- Achat du 10/07 : 15,000 kg × 2,500 DT/kg = 37,500 DT
- [[Nom:transfert]] [[acc:transfert:reçu:reçue]] [[du:labo]] le 12/07 : 5,000 kg × 2,400 DT/kg = 12,000 DT

PMP = (23,000 + 37,500 + 12,000) ÷ (10,000 + 15,000 + 5,000) = 72,500 ÷ 30 = **2,417 DT TTC le kg** (arrondi).

L'achat de 15 kg pèse davantage dans la moyenne que [[le:transfert]] de 5 kg : c'est le principe de la pondération.
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat déplace la moyenne — un gros volume à prix différent la déplace beaucoup, un petit volume très peu.
- [[Un:inventaire]] redémarre le calcul : seules les entrées postérieures à sa date comptent. Pour la valeur [[du:stock]], la quantité comptée reste toutefois valorisée à son coût moyen d'avant [[nom:inventaire]] quand il existe.
- Ne comptent **pas** dans le PMP : les consommations de production, [[le:vente:pl]], [[le:perte:pl]] et les lignes sans prix.
- Modifier ou supprimer une ligne d'achat passée recalcule le PMP immédiatement, y compris pour les écrans déjà consultés.
- [[Au:labo]], seuls les achats saisis [[au:labo]] comptent : [[le:transfert:pl]] y sont des sorties, pas des entrées.

### Voir aussi

- [La valeur [[du:stock]]](#calc-valeur-stock)
- [Le coût de revient d'[[un:recette]]](#calc-cout-recette)
- [[[Nom:transfert:pl]]](#transferts)
- [[[Nom:inventaire]]](#inventaire)
- [HT et TTC](#calc-ht-ttc)$m194_calc_pmp$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-pmp'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '690cdf9a76da6ef27f7ccbe3c010ec55';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-pmp'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-pmp'::TEXT;
  END IF;
  -- ── calc-prix ──
  t := $m194_calc_prix$## 🏷️ Qui fixe quel prix

LabFlow manipule quatre prix différents, chacun saisi ou calculé à un moment précis. Comprendre qui fixe quoi évite bien des confusions à la lecture [[un:stock:pl]] et des rapports.

### La règle

| Prix | Qui le fixe | Quand | À quoi il sert |
|---|---|---|---|
| Prix d'achat | vous (HT + taux de TVA) | à chaque [[nom:appro]] | PMP, valeur [[de:stock]], coût [[un:recette:pl]] |
| Prix de vente (PV) | vous, par [[nom:produit]] et par [[nom:activite]] | dans la configuration [[du:vente]] | chiffre d'affaires, [[nom:marge:pl]] |
| Prix de cession | vous (pré-rempli par le système) | à chaque [[nom:transfert]] [[compl:labo]] → [[nom:activite]] | coût d'entrée côté [[nom:activite]] |
| Prix d'un composé valorisé | calculé par LabFlow | à chaque production [[au:labo]] | valeur [[du:produit]] [[acc:produit:fini:finie]], [[nom:transfert:pl]], rapports |

### Le prix d'achat : saisi HT, affiché TTC

[[Au:appro]], vous saisissez le prix **hors taxes** et le **taux de TVA**. Le système calcule le TTC, et c'est lui qui est affiché dans [[le:stock:pl]], les rapports et les tableaux de bord.

:::formule Prix TTC
PRIX TTC = PRIX HT × (1 + TVA ÷ 100)
:::

### Le prix de vente (PV)

Le PV se définit pour chaque [[nom:produit_vendable]], **[[nom:activite]] par [[nom:activite]]**, dans la configuration [[du:vente]]. Il doit être renseigné (supérieur à zéro) pour qu'[[un:produit]] soit [[acc:produit:actif:active]] [[au:vente]], et chaque modification est conservée dans un historique de prix.

### Le prix de cession

[[Au:transfert]], le prix proposé est le PMP TTC [[du:labo]] pour [[un:article]], ou le coût [[de:recette]] [[au:labo]] pour [[un:pt]] ; vous pouvez l'ajuster avant de valider. Voir [Valorisation [[un:transfert:pl]]](#calc-transferts).

### Le prix figé des composés valorisés

Un **composé valorisé** est [[un:produit_vendable]] [[acc:produit_vendable:fabriqué:fabriquée]] [[au:labo]]. « Valorisé » signifie que sa valeur ne provient pas d'un prix d'achat [[nom:fournisseur]] : elle est **calculée** à partir du coût réel de [[son:recette]] — [[nom:article:pl]] au PMP TTC, sous-produits compris — au moment précis de la production, puis **figée** sur cette production. Les variations de prix ultérieures ne touchent pas les unités déjà produites : la production suivante portera son propre coût.

:::exemple
- Achat : 100 kg de farine à 1,200 DT HT, TVA 7 % → 1,284 DT TTC le kg, soit 128,400 DT TTC.
- Production [[au:labo]] : [[le:recette]] du « Millefeuille » consomme 2,150 DT TTC [[de:article:pl]] au PMP du jour → chaque unité produite est figée à 2,150 DT.
- [[Nom:transfert]] : les millefeuilles partent vers [[le:activite]] au prix de cession proposé de 2,150 DT (ajustable).
- [[Nom:vente]] : dans la configuration [[du:vente]] [[du:activite]], le PV du millefeuille est fixé à 4,500 DT → [[nom:marge]] [[acc:marge:brut:brute]] de 2,350 DT par pièce.

Le lendemain, la farine augmente : les millefeuilles déjà produits restent valorisés 2,150 DT ; la production suivante sera figée à son nouveau coût.
:::

### Variations

- [[Le:pt:pl]] [[acc:pt:fabriqué:fabriquée:pl]] **dans [[un:activite]]** suivent le même principe : coût [[de:recette]] calculé et figé à chaque production.
- [[acc:produit:Un même:Une même]] [[nom:produit]] peut avoir un **PV différent** dans chaque [[nom:activite]].

:::regle
Convention d'affichage : les prix d'achat se saisissent en HT + TVA, mais tous les écrans ([[nom:stock:pl]], [[nom:pt:pl]], rapports, tableaux de bord) affichent des montants TTC.
:::

### Voir aussi

- [HT et TTC](#calc-ht-ttc)
- [Coût d'[[un:recette]]](#calc-cout-recette)
- [Production [[un:pt:pl]]](#calc-production-pt)
- [Valorisation [[un:transfert:pl]]](#calc-transferts)
- [Configuration [[du:vente]]](#configuration-vente)
- [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises)$m194_calc_prix$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-prix'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '1e45b9058f9d275e520281d811ebdeae';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-prix'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-prix'::TEXT;
  END IF;
  -- ── calc-production-pt ──
  t := $m194_calc_production_pt$## 🏭 Ce que déclenche la production d'[[un:pt]]

Quand vous enregistrez la production d'[[un:pt]] — [[au:labo]] pour [[le:produit:pl]] d'origine [[nom:labo]], dans [[le:activite]] pour les autres — LabFlow écrit plusieurs mouvements [[de:stock]] en une seule opération, **tout ou rien** : si l'un échoue, rien n'est enregistré.

**Ce qui est créé** : une entrée en [[nom:stock]] [[du:produit]] [[acc:produit:fini:finie]], à la quantité produite, valorisée à son **coût [[de:recette]] du moment** ([[nom:ingredient:pl]] au PMP TTC, sous-produits inclus récursivement). Cette ligne porte [[le:fournisseur]] **AUTO** et une **référence automatique** : les initiales du nom [[du:produit]] suivies de l'année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d'un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d'[[un:pt]] est de 0 %.

**Ce qui est déduit** :

- chaque **[[nom:ingredient]]** [[du:recette]] : sortie [[de:stock]] [[de:portion]] × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** [[du:recette]] : sortie [[de:stock]] du sous-produit, valorisée à son coût [[de:recette]]. [[Le:ingredient:pl]] des sous-produits, [[acc:ingredient:eux:elles]], ont déjà été [[acc:ingredient:déduit:déduite:pl]] au moment où ces sous-produits ont été fabriqués — [[acc:ingredient:ils:elles]] ne sont pas [[acc:ingredient:déduit:déduite:pl]] une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite.**
- **[[Le:portion:pl]] [[du:recette]]**, ou [[le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]] [[acc:portion:saisi:saisie:pl]] pour cette production.
- **Le PMP TTC de chaque [[nom:ingredient]]** au moment de la production.
- **Le coût [[de:recette]] de chaque sous-produit** consommé.

:::formule Mouvements écrits à la production
Entrée [[nom:produit]] [[acc:produit:fini:finie]] = quantité produite, au coût [[de:recette]] (PMP TTC) ; sortie de chaque composant = [[nom:portion]] × quantité produite ([[nom:article]] au PMP, sous-produit au coût [[de:recette]])
note: écriture tout-ou-rien — [[le:stock]] [[du:produit]] [[acc:produit:fini:finie]] gagne la valeur que perdent [[le:stock:pl]] des composants.
:::

:::exemple
Production [[au:labo]] de 20 « Crème Pâtissière » le 15/07/2026. [[Nom:recette]] pour 1 unité : 0,500 L de lait (PMP 2,000 DT), 4 œufs (PMP 0,700 DT), 0,200 kg de sucre (PMP 3,200 DT). Coût [[de:recette]] = 1,000 + 2,800 + 0,640 = **4,440 DT** l'unité.

Mouvements écrits :

- Entrée « Crème Pâtissière » ([[nom:fournisseur]] AUTO, réf. CP-26) : +20 unités à 4,440 DT/unité
- Sortie lait : −10,000 L à 2,000 DT/L
- Sortie œufs : −80 pièces à 0,700 DT/pièce
- Sortie sucre : −4,000 kg à 3,200 DT/kg

[[Le:stock]] [[du:produit]] [[acc:produit:fini:finie]] gagne 20 × 4,440 = **88,800 DT** de valeur ; [[le:stock:pl]] [[de:ingredient:pl]] perdent 20,000 + 56,000 + 12,800 = **88,800 DT**. L'opération est neutre : la valeur a simplement changé de forme.
:::

### Ce qui peut faire varier le résultat

- [[Au:labo]], la production est **refusée** si [[le:stock]] disponible d'[[un:ingredient]] ou d'un sous-produit est [[acc:stock:insuffisant:insuffisante]].
- [[Un:produit]] d'origine [[nom:labo]] ne peut pas être [[acc:produit:produit:produite]] ni [[acc:produit:approvisionné:approvisionnée]] directement dans [[un:activite]] : [[acc:produit:il:elle]] n'y arrive que par [[nom:transfert]].
- [[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]] modifient les quantités réellement déduites, sans toucher [[au:fiche_technique]] ; l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard.
- Si [[un:ingredient]] n'a pas encore de prix connu, le coût de la production est incomplet.
- Les sorties liées à une production sont identifiables dans les historiques ([[nom:fournisseur]] AUTO, référence automatique) ; elles n'entrent ni dans le PMP ni dans [[le:vente:pl]].

### Voir aussi

- [Le coût de revient d'[[un:recette]]](#calc-cout-recette)
- [La valeur [[du:stock]]](#calc-valeur-stock)
- [La traçabilité des mouvements](#calc-tracabilite)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [Lexique [[un:pt:pl]]](#lexique-pt)$m194_calc_production_pt$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-production-pt'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'af32bc003605762547bb6a7aa548b22b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-production-pt'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-production-pt'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Production d''[[un:pt]]' WHERE slug = 'calc-production-pt' AND titre = 'Production d''un produit transformé';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-production-pt' AND titre = 'Production d''[[un:pt]]') THEN titres_gardes := titres_gardes || 'calc-production-pt'::TEXT; END IF;
  -- ── calc-seuils ──
  t := $m194_calc_seuils$## 🚨 Les seuils d'alerte [[de:stock]]

Les seuils minimums colorent vos lignes [[de:stock]] et font remonter [[le:produit:pl]] à surveiller. Le calcul est volontairement simple : une comparaison directe entre [[le:stock]] [[acc:stock:courant:courante]] et le seuil que vous avez fixé.

### La règle

- Un seuil minimum se définit **par [[nom:article]] ou par [[nom:pt]]**, et il est **indépendant** pour chaque [[nom:activite]] et pour chaque [[nom:labo]] : le même beurre peut avoir un seuil de 10 kg dans [[un:activite]] et de 25 kg [[au:labo]].
- Pour [[det:pt:un]]**[[nom:pt]]** dans [[un:activite]], le seuil se règle par [[nom:activite]] ; si aucun seuil n'est défini pour [[le:activite]], le **seuil global [[du:produit]]** s'applique en repli.
- Aucun seuil n'est obligatoire : sans seuil, seule la **rupture** ([[nom:stock]] [[acc:stock:épuisé:épuisée]]) est signalée.

### Les paramètres

| Portée | Comparaison effectuée |
|---|---|
| [[Nom:article]] dans [[un:activite]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:activite]] et seuil réglé sur la page [[Nom:stock]] [[du:activite]] |
| [[Nom:article]] [[au:labo]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:labo]] et seuil réglé [[au:labo]] |
| [[Nom:pt]] dans [[un:activite]] | [[nom:stock]] [[acc:stock:courant:courante]] et seuil [[du:produit]] pour [[ce:activite]] (repli : seuil global [[du:produit]]) |
| [[Nom:pt]] [[au:labo]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:labo]] et seuil réglé [[au:labo]] |

:::formule État de l'alerte
ROUGE si [[MAJ:stock]] ≤ SEUIL · ORANGE si [[MAJ:stock]] ≤ SEUIL × 1,10 · VERT au-delà
note: sans seuil défini, [[acc:stock:seul:seule]] [[un:stock]] [[acc:stock:épuisé:épuisée]] passe en rouge.
:::

La légende est rappelée dans la fenêtre de réglage du seuil : 🔴 ≤ seuil · 🟠 seuil + 10 % · 🟢 au-dessus.

:::exemple
Beurre, seuil fixé à 10 kg dans [[le:activite]] :

- [[nom:stock]] 12 kg → 12 dépasse 11 (soit 10 + 10 %) : ligne verte ;
- [[nom:stock]] 10,8 kg → entre 10 et 11 : orange, zone de vigilance ;
- [[nom:stock]] 9 kg → 9 ≤ 10 : rouge, alerte ;
- [[nom:stock]] 0 kg → rouge, même si aucun seuil n'avait été défini.

[[Au:labo]], le même beurre avec un seuil de 25 kg et [[un:stock]] de 30 kg reste vert : les deux alertes vivent séparément.
:::

### Pourquoi [[un:inventaire]] peut changer l'état d'une alerte

[[Le:stock]] [[acc:stock:courant:courante]] repart toujours [[acc:inventaire:du:de la]] **[[acc:inventaire:dernier:dernière]] [[nom:inventaire]] [[acc:inventaire:validé:validée]]** : quantité réellement comptée, plus les entrées et moins les sorties enregistrées depuis. Valider [[un:inventaire]] remplace donc [[le:stock]] théorique par [[le:stock]] [[acc:stock:compté:comptée]]. Si le comptage révèle plus de marchandise que prévu, une ligne rouge peut repasser au vert immédiatement — et inversement si le comptage révèle un manque.

### Variations

- [[Le:article:pl]] sous leur seuil remontent dans les **alertes du tableau de bord**.
- Le seuil est un déclencheur **visuel** : il ne bloque ni [[le:vente:pl]], ni la production, ni [[le:transfert:pl]].

:::astuce
Fixez le seuil au niveau de votre consommation pendant le délai de réapprovisionnement : la zone orange (marge de 10 %) vous laisse le temps de commander avant la rupture.
:::

### Voir aussi

- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [[[Nom:inventaire]]](#inventaire)
- [Valeur [[de:stock]]](#calc-valeur-stock)
- [Tableau de bord](#dashboard)$m194_calc_seuils$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-seuils'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4ce1ee281f4ef488557357c42f111488';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-seuils'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-seuils'::TEXT;
  END IF;
  -- ── calc-tracabilite ──
  t := $m194_calc_tracabilite$## 🧾 La traçabilité automatique

Chaque mouvement [[de:stock]] que LabFlow génère pour vous — production, consommation [[de:recette]], [[nom:transfert]], [[nom:vente]] — porte une référence et, dans la plupart des cas, [[un:fournisseur]], même quand ce n'est pas vous qui les avez saisis. Voici comment lire ces mentions dans les historiques.

### La règle

Trois mentions automatiques existent :

- **[[Nom:fournisseur]] AUTO** — [[acc:fournisseur:porté:portée]] par les mouvements générés par le système : la ligne de production d'[[un:pt]], les sorties [[de:article:pl]] et de sous-produits consommés par [[le:recette]], les sorties liées [[au:vente:pl]], ainsi que la sortie [[de:transfert]] d'[[un:pt]] côté [[nom:labo]]. Cette fiche est créée automatiquement et n'apparaît pas dans votre liste [[de:fournisseur:pl]].
- **Référence automatique** — construite à partir du nom [[du:produit]] et de l'année de l'opération (voir formule ci-dessous).
- **[[Nom:fournisseur]] « [[nom:labo]] »** — les réceptions [[de:transfert]] côté [[nom:activite]] portent le **nom de [[votre:labo]]** comme [[nom:fournisseur]]. Cette fiche [[nom:fournisseur]] est créée automatiquement avec [[le:labo]], suit son nom, et ne peut être ni modifiée ni supprimée depuis l'écran [[Pl:fournisseur]].

:::formule Référence automatique
RÉF = INITIALES DU NOM (ou 3 PREMIÈRES LETTRES si un seul mot) + « - » + ANNÉE SUR 2 CHIFFRES
note: en majuscules, sans accents ; l'année est celle de la date de l'opération. « Crème Pâtissière » en 2026 → CP-26 ; « Cookies » → COO-26.
:::

:::exemple
Production de 40 « Crème Pâtissière » [[au:labo]], le 15 mars 2026 :

- entrée de 40 unités : [[nom:fournisseur]] AUTO, référence **CP-26** (initiales de « Crème Pâtissière » + année) ;
- sortie de 10 kg de « Lait » consommé par [[le:recette]] : [[nom:fournisseur]] AUTO, référence **LAI-26** (un seul mot → 3 premières lettres) ;
- sortie de 2 kg de « Sucre Semoule » : [[nom:fournisseur]] AUTO, référence **SS-26**.

Une semaine plus tard, 20 unités partent en [[nom:transfert]] vers [[le:activite]] « Salon de thé » avec le bon de livraison BL-0187 : l'entrée côté [[nom:activite]] affiche le nom [[du:labo]] en [[nom:fournisseur]] et la référence BL-0187 ; la sortie côté [[nom:labo]] porte [[le:fournisseur]] AUTO et la même référence.
:::

### Comment lire les historiques

- Dans l'historique d'[[det:activite:un]]**[[nom:activite]]**, la mention AUTO apparaît sur les lignes de sortie (quantités négatives) générées par le système : consommations [[de:recette]] (badge 🔄 [[Court:pt]]) et sorties [[de:vente]] (badge 💰 [[Court:vente]]). Les entrées de production affichent la référence automatique [[du:produit]].
- Dans l'historique [[det:labo:du]]**[[nom:labo]]**, les lignes de production et les consommations qu'elles déclenchent portent [[le:fournisseur]] AUTO et leur référence automatique.
- Les réceptions [[de:transfert]] (badge *[[Court:transfert]]*) affichent le **nom [[du:labo]]** en [[nom:fournisseur]] et la référence saisie [[au:transfert]], dans la colonne Réf. Facture / BL.
- Le filtre **Type [[de:appro:court]]** des historiques ([[acc:appro:Manuel:Manuelle]], [[Court:transfert]], [[Court:vente]], [[Court:pt]]) permet d'isoler ces mouvements.

### Variations

- La référence automatique change chaque année : une production de janvier 2027 [[acc:produit:du même:de la même]] [[nom:produit]] portera CP-27.
- Deux [[nom:produit:pl]] partageant les mêmes initiales partagent la même référence : c'est le couple [[nom:produit]] + référence qui identifie le mouvement, pas la référence seule.

:::astuce
Si une ligne porte [[le:fournisseur]] AUTO, elle n'a pas été saisie à la main : inutile de chercher qui l'a créée, c'est une écriture système déclenchée par une production ou [[un:vente]].
:::

### Voir aussi

- [Production [[un:pt:pl]]](#calc-production-pt)
- [Valorisation [[un:transfert:pl]]](#calc-transferts)
- [Historique](#historique)
- [[[Nom:fournisseur:pl]]](#fournisseurs)$m194_calc_tracabilite$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-tracabilite'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '3ab9d51697fb74baf483b90aae718adf';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-tracabilite'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-tracabilite'::TEXT;
  END IF;
  -- ── calc-transferts ──
  t := $m194_calc_transferts$## 🚚 Valorisation [[du:transfert:pl]]

Quand [[votre:labo]] envoie [[un:article:pl]] ou [[un:pt:pl]] vers [[un:activite]] ou vers [[un:labo]] qu'[[acc:labo:il:elle]] alimente, chaque ligne est valorisée à un **prix de cession**. Cette fiche explique comment ce prix est déterminé et ce qu'il devient de part et d'autre [[du:transfert]].

### La règle

- Chaque ligne transférée porte un prix de cession **TTC**, affiché et modifiable au moment [[du:transfert]].
- Pour [[det:article:un]]**[[nom:article]]**, le prix est pré-rempli avec le coût moyen pondéré (PMP) [[du:labo]], TVA incluse ; le système enregistre la paire HT/TTC à partir du taux de TVA [[du:article]].
- Pour [[det:pt:un]]**[[nom:pt]]**, le prix est pré-rempli avec le coût actuel de [[son:recette]] [[au:labo]] — le même calcul que [[le:fiche_technique]], [[nom:article:pl]] au PMP TTC — (pas de TVA : HT = TTC) ; à défaut de prix saisi, c'est le dernier coût de fabrication [[au:labo]] qui est retenu.
- Une **référence** (numéro de bon de livraison ou de facture) est obligatoire : elle accompagne le mouvement des deux côtés.

### Les paramètres

| Paramètre | Origine |
|---|---|
| Quantité | saisie, limitée [[au:stock]] disponible [[du:labo]] |
| Prix de cession TTC | saisi (pré-rempli : PMP TTC [[du:labo]] pour [[un:article]], coût [[de:recette]] [[au:labo]] pour [[un:pt]]) |
| Taux de TVA | celui [[du:article]] ([[nom:pt]] : TVA à 0) |
| Référence | numéro de BL / facture saisi [[au:transfert]] |

:::formule Prix de cession HT
PRIX HT = PRIX TTC ÷ (1 + TVA ÷ 100)
note: pour [[un:pt]], la TVA est nulle : HT = TTC.
:::

### Des deux côtés [[du:transfert]]

- **Côté [[nom:labo]]** : sortie [[de:stock]] valorisée au prix de cession, visible dans les historiques avec le badge *[[Court:transfert]]*.
- **Côté destination** ([[nom:activite]] ou [[nom:labo]] [[acc:labo:rattaché:rattachée]]) : entrée [[de:stock]] au nom du **fournisseur-labo** (fiche [[nom:fournisseur]] créée automatiquement avec [[le:labo]]), avec la référence saisie. Pour [[un:article]], cette entrée alimente le **PMP de la destination** exactement comme un achat [[nom:fournisseur]] — [[un:labo]] [[acc:labo:alimenté:alimentée]] par [[acc:labo:un autre:une autre]] [[nom:labo]] fabrique donc [[son:pt:pl]] au coût réel des matières reçues. Pour [[un:pt]], [[le:stock]] [[du:activite]] est [[acc:stock:valorisé:valorisée]] au prix de la **dernière réception**.

:::exemple
[[Le:labo]] transfère 20 kg de farine [[au:activite]] « Pâtisserie Centre ». PMP [[compl:labo]] : 1,200 DT HT/kg, TVA 7 % → prix de cession pré-rempli : 1,284 DT TTC/kg.

- Côté [[nom:labo]] : sortie de 20 kg valorisée 20 × 1,284 = 25,680 DT TTC.
- Côté [[nom:activite]] : entrée de 20 kg, [[nom:fournisseur]] = [[le:labo]], référence BL-0642.
- PMP [[du:activite]] : [[acc:activite:il:elle]] détenait 30 kg à 1,400 DT TTC/kg → nouveau PMP = (30 × 1,400 + 20 × 1,284) ÷ 50 = 67,680 ÷ 50 ≈ 1,354 DT TTC/kg.

Le même jour, 15 crèmes pâtissières (coût [[de:recette]] [[au:labo]] : 3,500 DT) partent au prix proposé : [[le:activite]] les reçoit valorisées 3,500 DT pièce, soit 52,500 DT.
:::

### Variations

- Vous pouvez remplacer le prix pré-rempli ([[nom:marge]] interne, prix négocié) : c'est le prix saisi qui fait foi côté [[nom:activite]].
- [[Un:pt]] ne peut être [[acc:pt:transféré:transférée]] que vers [[un:activite]] ou [[un:labo]] [[acc:labo:rattaché:rattachée]] [[acc:labo:auquel:à laquelle]] [[acc:pt:il:elle]] est **[[acc:pt:affecté:affectée]]** ; sinon [[le:transfert]] est [[acc:transfert:refusé:refusée]].
- Si [[le:stock]] [[du:labo]] est [[acc:stock:insuffisant:insuffisante]], [[le:transfert]] est [[acc:transfert:bloqué:bloquée]] et la quantité disponible vous est indiquée.
- Pour [[le:article:pl]] [[acc:article:transféré:transférée:pl]], la référence saisie alimente aussi les **factures** [[du:activite]] (sans timbre fiscal).

:::attention
Le prix de cession devient le coût d'entrée définitif côté destination ([[nom:activite]] ou [[nom:labo]]) : un prix erroné fausse le PMP, donc la valeur [[de:stock]] et le coût de [[votre:recette:pl]].
:::

### Voir aussi

- [[[Nom:transfert:pl]]](#transferts)
- [Le PMP](#calc-pmp)
- [Qui fixe quel prix](#calc-prix)
- [HT et TTC](#calc-ht-ttc)$m194_calc_transferts$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-transferts'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '7ab3484df0b078e161fe537a1fe6b696';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-transferts'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-transferts'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Valorisation [[du:transfert:pl]]' WHERE slug = 'calc-transferts' AND titre = 'Valorisation des transferts';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-transferts' AND titre = 'Valorisation [[du:transfert:pl]]') THEN titres_gardes := titres_gardes || 'calc-transferts'::TEXT; END IF;
  -- ── calc-valeur-stock ──
  t := $m194_calc_valeur_stock$## 💰 La valeur [[du:stock]] [[acc:stock:actuel:actuelle]]

La valeur de [[votre:stock]] est calculée ligne par ligne : quantité actuelle × coût unitaire moyen TTC. La quantité actuelle repart toujours [[acc:inventaire:du:de la]] **[[acc:inventaire:dernier:dernière]] [[nom:inventaire]]** : on prend la quantité comptée ce jour-là, puis on ajoute et retranche tous les mouvements survenus depuis. S'il n'y a jamais eu [[de:inventaire]], tous les mouvements depuis l'origine sont pris en compte.

### Les paramètres qui influencent le résultat

- **[[acc:inventaire:Le dernier:La dernière]] [[nom:inventaire]]** : quantité comptée et date (point de départ du calcul).
- **Les mouvements depuis cette date** : achats, [[nom:transfert:pl]], consommations de production, [[nom:vente:pl]], [[nom:perte:pl]].
- **Les prix TTC des entrées**, qui déterminent le coût moyen (voir [Le prix moyen pondéré](#calc-pmp)).
- **La nature de la ligne** ([[nom:article]] ou [[nom:pt]]) et **le lieu** ([[nom:activite]] ou [[nom:labo]]) :

| Où | Quantité actuelle |
|---|---|
| [[Nom:article]] en [[nom:activite]] | [[nom:inventaire]] + achats + [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] − consommations de production − [[nom:vente:pl]] − [[nom:perte:pl]] |
| [[Nom:article]] [[au:labo]] | [[nom:inventaire]] + achats − consommations de production − [[nom:transfert:pl]] [[acc:transfert:envoyé:envoyée:pl]] − [[nom:perte:pl]] |
| [[Nom:pt]] en [[nom:activite]] | [[nom:inventaire]] + réceptions ([[nom:transfert:pl]] ou productions) − [[nom:vente:pl]] − consommations en sous-produit − [[nom:perte:pl]] |
| [[Nom:pt]] [[au:labo]] | [[nom:inventaire]] + productions − consommations en sous-produit − [[nom:transfert:pl]] [[acc:transfert:envoyé:envoyée:pl]] − [[nom:perte:pl]] |

Pour la valorisation :

- **[[Nom:article]]** : valeur = quantité actuelle × PMP TTC. Le dernier prix reçu (achat ou [[nom:transfert]]) est affiché à titre d'information, mais la valeur totale est bien calculée au coût moyen pondéré.
- **[[Nom:pt]]** : chaque entrée porte son coût — coût [[de:recette]] pour une production, prix de cession TTC pour une réception [[de:transfert]] ; la valeur = quantité actuelle × moyenne des coûts des entrées depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]. À défaut d'entrée valorisée depuis [[le:inventaire]], la moyenne de toutes les entrées sert de base ; en dernier recours, le dernier coût de réception connu ou le coût [[de:recette]] actuel.

:::formule Valeur [[du:stock]] d'[[un:article]]
Valeur = quantité actuelle × PMP TTC
note: quantité actuelle = quantité [[de:inventaire]] + entrées − sorties depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] ; sans [[nom:inventaire]], tous les mouvements depuis l'origine.
:::

:::exemple
Farine dans [[un:activite]], [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] le 30/06 : **12,000 kg comptés**. Depuis :

- achats : +25,000 kg à 2,400 DT TTC le kg
- consommations de production : −6,000 kg
- [[nom:vente:pl]] : −4,500 kg
- [[nom:perte:pl]] : −1,500 kg

Quantité actuelle = 12,000 + 25,000 − 6,000 − 4,500 − 1,500 = **25,000 kg**.

Aucun achat n'avait été enregistré avant [[ce:inventaire]] : seul l'achat de 25 kg à 2,400 DT entre dans le coût moyen, donc PMP = 2,400 DT TTC.

**Valeur [[du:stock]] = 25,000 kg × 2,400 DT = 60,000 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- [[acc:inventaire:Un:Une]] [[nouveau:inventaire]] remplace la base de calcul : la quantité repart de la valeur comptée.
- La quantité comptée [[au:inventaire]] est valorisée à son coût moyen d'avant [[le:inventaire]] quand il existe ; sinon elle compte dans la quantité mais pas dans le coût moyen.
- Si la quantité actuelle est nulle ou négative, la valeur affichée est 0.
- Modifier ou supprimer un mouvement passé (achat, [[nom:transfert]], [[nom:perte]]) recalcule immédiatement quantité et valeur.
- Les quantités sont arrondies au millième (trois décimales).

### Voir aussi

- [[[Nom:stock]] [[un:activite:pl]]](#stock-activites)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [[[Nom:inventaire]]](#inventaire)
- [Le prix moyen pondéré](#calc-pmp)
- [[[Nom:perte:pl]]](#pertes)$m194_calc_valeur_stock$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-valeur-stock'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '66185af8ff1e7c47f73f487d3af837f5';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-valeur-stock'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-valeur-stock'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Valeur [[du:stock]]' WHERE slug = 'calc-valeur-stock' AND titre = 'Valeur du stock';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-valeur-stock' AND titre = 'Valeur [[du:stock]]') THEN titres_gardes := titres_gardes || 'calc-valeur-stock'::TEXT; END IF;
  -- ── categories-produits ──
  t := $m194_categories_produits$## 🏷️ Catégories [[de:produit]]

Cet écran vous permet de classer [[votre:produit:pl]] [[de:vente]] en catégories (par exemple « Entrées », « Boissons », « Desserts »). Vous le trouvez dans le menu **Espace [[Pl:produit]] → Catégories [[Court:produit:pl]]**. Ces catégories structurent ensuite la configuration des prix de vente et la saisie [[du:vente:pl]].

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de catégories** créées.
- Une barre de filtres : champ **Recherche** (filtre sur le nom), liste **Type** (tous les types ou un seul), bouton **Réinitialiser** dès qu'un filtre est actif, et le bouton **+ Nouvelle catégorie**.
- Un tableau à quatre colonnes : **Nom**, **Type** (badge), **[[Pl:produit]]** (nombre [[de:produit:pl]] [[acc:produit:rattaché:rattachée:pl]] à la catégorie) et **Actions** (✏️ Modifier, 🗑️ Supprimer).

Chaque catégorie appartient obligatoirement à **un type**, qui détermine où elle sera proposée :

| Type | Sert à classer |
|---|---|
| 🍽️ [[Nom:produit_vendable]] | [[Le:produit:pl]] [[acc:produit:fini:finie:pl]] [[acc:produit:vendu:vendue:pl]] à la carte (plats, pizzas, formules…) |
| ➕ [[Nom:supplement]] vendable | [[Le:supplement:pl]] [[acc:supplement:vendu:vendue:pl]] en complément (sauce, garniture…) |
| 💎 [[Nom:article]] [[acc:article:valorisé:valorisée]] | [[Le:article:pl]] [[acc:article:revendu:revendue:pl]] [[acc:article:tels quels:telles quelles]] (boissons en bouteille, [[nom:produit:pl]] négoce…) |

### Actions pas à pas

**Créer une ou plusieurs catégories**

1. Cliquez sur **+ Nouvelle catégorie**.
2. Choisissez le **Type** : il s'appliquera à tous les noms saisis dans cette fenêtre.
3. Saisissez un nom par ligne. Ajoutez des lignes avec **+ Ajouter une ligne** (la touche Entrée sur la dernière ligne en crée une nouvelle) ; le bouton × retire une ligne.
4. Cliquez sur **Enregistrer** : toutes les lignes remplies sont créées d'un coup.

**Modifier une catégorie**

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Ajustez le type et/ou le nom, puis **Enregistrer**.

**Supprimer une catégorie**

1. Cliquez sur **🗑️**, puis confirmez dans la fenêtre d'avertissement.

### Points d'attention

:::regle
Lors de l'affectation d'une catégorie à [[un:produit]], seules les catégories du **bon type** sont proposées : une catégorie « [[Nom:supplement]] vendable » n'apparaîtra jamais dans la liste d'[[un:produit_vendable]], et inversement.
:::

:::attention
La suppression d'une catégorie ne supprime pas [[le:produit:pl]] : [[acc:produit:il:elle:pl]] **perdent simplement leur catégorie** et devront être [[acc:produit:reclassé:reclassée:pl]] pour rester bien [[acc:produit:organisé:organisée:pl]] dans la configuration [[de:vente]].
:::

:::astuce
Créez vos catégories **avant** [[votre:produit:pl]] : la catégorie est obligatoire à la création d'[[un:produit_vendable]] ou d'[[un:supplement]], et nécessaire pour qu'[[un:article]] [[acc:article:valorisé:valorisée]] soit [[acc:article:proposé:proposée]] [[au:vente]].
:::

### Voir aussi

- [[[Titre:produit_vendable:pl]]](#produits-vendables) — la catégorie y est exigée à la création
- [[[Titre:produit_valorise:pl]]](#articles-valorises) — assignez une catégorie de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] »
- [Configuration [[Court:vente]]](#configuration-vente) — les catégories y organisent vos prix
- [Saisie [[du:vente:pl]]](#saisie-ventes) — [[le:produit:pl]] y sont [[acc:produit:regroupé:regroupée:pl]] par catégorie
- [Lexique](#lexique)$m194_categories_produits$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'categories-produits'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4dcff58694ad94d8edd8d3ed712ac00b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'categories-produits'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'categories-produits'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Catégories [[Court:produit:pl]]' WHERE slug = 'categories-produits' AND titre = 'Catégories Produits';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'categories-produits' AND titre = 'Catégories [[Court:produit:pl]]') THEN titres_gardes := titres_gardes || 'categories-produits'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_produits]]' WHERE slug = 'categories-produits' AND partie = 'Espace Produit';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'categories-produits' AND partie = '[[Nom:espace_produits]]') THEN parties_gardees := parties_gardees || 'categories-produits'::TEXT; END IF;
  -- ── charges ──
  t := $m194_charges$## 🏗️ Charges

Cet écran vous permet de déclarer les **charges fixes annuelles** de chaque [[nom:activite]] (loyer, personnel, énergie, eau…). Ces montants complètent [[le:cout_matiere]] dans vos analyses de rentabilité, notamment le calcul du seuil de rentabilité. Vous y accédez par **[[Nom:espace_vente]] → Config Charges**, ou par le raccourci 🏗️ Charges de la Configuration [[Court:vente]].

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** : les charges se déclarent [[nom:activite]] par [[nom:activite]].
- Dans l'en-tête, le **total des charges annuelles** [[du:activite]] [[acc:activite:sélectionné:sélectionnée]], dès qu'un montant est saisi.
- Un bloc **Mode de saisie** avec deux options : **📊 Montant global** ou **📋 Détail par poste**.
- En mode détail, quatre postes de charge : **🏠 Loyer**, **👥 Charges personnel**, **⚡ Électricité / Gaz** et **💧 Eau**, tous exprimés en DT par an.
- Deux cartes de synthèse calculées automatiquement : **📅 Total annuel** et **📆 Mensuel (÷12)**.
- Le bouton **✓ Enregistrer** (ou **✓ Mettre à jour** si des charges existent déjà pour [[le:activite]]).

### Actions pas à pas

1. Sélectionnez [[le:activite]] [[acc:activite:concerné:concernée]].
2. Choisissez le mode de saisie : **Montant global** si vous connaissez votre total annuel, **Détail par poste** pour ventiler loyer, personnel, énergie et eau.
3. Saisissez les montants en **DT par an**.
4. Vérifiez les cartes *Total annuel* et *Mensuel* qui se mettent à jour automatiquement.
5. Cliquez sur **✓ Enregistrer** ; un message vert confirme la sauvegarde.

:::formule Équivalent mensuel
Charges mensuelles = Total annuel ÷ 12
:::

:::exemple
Loyer 24 000 DT/an + charges personnel 36 000 DT/an + électricité/gaz 6 000 DT/an + eau 1 200 DT/an = **67 200 DT/an**, soit 5 600 DT de charges par mois.
:::

### Points d'attention

:::attention
Les montants se saisissent **à l'année**, pas au mois. Si vous saisissez un loyer mensuel, le total annuel — et toutes les analyses qui en découlent — seront fortement sous-estimés.
:::

:::attention
Le mode choisi détermine le calcul : en **Détail par poste**, le total est la somme des quatre postes ; en **Montant global**, seul le montant global compte. Après un changement de mode, vérifiez le total affiché dans l'en-tête avant d'enregistrer.
:::

:::astuce
Mettez ces montants à jour à chaque évolution notable (nouveau bail, embauche, hausse du prix de l'énergie) : vos indicateurs de rentabilité resteront fidèles à la réalité de votre exploitation.
:::

:::regle
Les charges fixes ne modifient pas [[le:cout_matiere]] de [[votre:recette:pl]] : elles s'ajoutent à [[acc:cout_matiere:celui-ci:celle-ci]] dans l'analyse de rentabilité globale [[du:activite]].
:::

### Voir aussi

- [Configuration [[Court:vente]]](#configuration-vente) — fixer les prix de vente
- [Rapports [[de:vente]]](#rapports-vente) — suivre CA, [[nom:marge:pl]] et [[nom:food_cost]]
- [Tableau de bord](#dashboard) — vision globale de la performance
- [Coût d'[[un:recette]]](#calc-cout-recette) — l'autre composante de [[votre:marge]]$m194_charges$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'charges'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'b393b8e0121fb4f275252badc06f2b31';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'charges'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'charges'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_vente]]' WHERE slug = 'charges' AND partie = 'Espace Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'charges' AND partie = '[[Nom:espace_vente]]') THEN parties_gardees := parties_gardees || 'charges'::TEXT; END IF;
  -- ── compte ──
  t := $m194_compte$## 👤 Mon compte

Cet écran regroupe vos informations personnelles et la sécurité de votre accès. Vous y accédez par l'entrée **Mon profil**, en bas du menu latéral. Propriétaire ou [[nom:gerant]], chacun gère ici son propre profil.

### Ce que vous voyez

- Un bandeau d'en-tête avec vos initiales, votre nom et votre adresse e-mail.
- La carte **Informations personnelles** : nom (obligatoire), e-mail (obligatoire) et téléphone.
- La carte **Sécurité — Changer le mot de passe** : mot de passe actuel, nouveau mot de passe et confirmation.
- Le bouton **Enregistrer les modifications**, qui valide l'ensemble du formulaire en une fois.

Lorsque vous modifiez l'e-mail, une vérification s'effectue en direct : si l'adresse est déjà utilisée par un autre compte, le message « Cet email est déjà utilisé » s'affiche et l'enregistrement est refusé.

### Actions pas à pas

**Mettre à jour vos informations**

1. Modifiez le nom, l'e-mail ou le téléphone.
2. Cliquez sur **Enregistrer les modifications**.
3. Un message de confirmation vert apparaît en haut de la page.

**Changer votre mot de passe**

1. Saisissez votre **mot de passe actuel** — il est obligatoire pour tout changement de mot de passe.
2. Saisissez le **nouveau mot de passe** : la liste des critères se coche en vert au fur et à mesure — au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, - ou #).
3. Confirmez le mot de passe : la mention « Mots de passe identiques » s'affiche quand les deux saisies correspondent.
4. Cliquez sur **Enregistrer les modifications**. Après le succès de l'opération, les champs de mot de passe se vident automatiquement.

**Première connexion**

À votre toute première connexion, un bandeau vous invite à définir un nouveau mot de passe avant d'accéder au reste de votre espace. Une fois ce mot de passe enregistré, vous êtes dirigé automatiquement vers la configuration de [[votre:activite:pl]] pour poursuivre le démarrage.

### Points d'attention

:::attention
Votre e-mail est votre identifiant de connexion : c'est aussi l'adresse qui reçoit vos contrats, avenants et factures. Vérifiez-le soigneusement avant d'enregistrer un changement.
:::

:::attention
Le numéro de téléphone doit être un numéro tunisien valide : 8 chiffres commençant par 2, 5, 7 ou 9, précédés ou non de l'indicatif +216.
:::

:::astuce
Changez votre mot de passe régulièrement et ne le partagez jamais. Chaque [[nom:gerant]] dispose de son propre accès avec son propre mot de passe : il n'y a aucune raison de communiquer le vôtre. Pour créer un accès à un collaborateur, passez par l'écran [[[Nom:gerant:pl]]](#gerants).
:::

### Voir aussi

- [Rôles et accès](#roles) — ce que voit un propriétaire, ce que voit [[un:gerant]]
- [Bien démarrer](#demarrage) — les premières étapes après l'activation du compte
- [[[Nom:gerant:pl]]](#gerants) — créer et gérer les accès de vos équipes
- [Demandes et support](#support) — contacter l'assistance$m194_compte$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'compte'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '125a36d9e8622a41d2a51b15c265c447';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'compte'::TEXT;
  END IF;
  -- ── compte-activites-labos ──
  t := $m194_compte_activites_labos$## 🏢 Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, [[det:activite:le:pl]]**[[nom:activite:pl]]** et [[det:labo:le:pl]]**[[nom:labo:pl]]**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre [[de:activite:pl]], [[de:labo:pl]] et de comptes [[nom:gerant:pl]] — et, si l'option [[Court:acheteur:pl]] est active, le palier [[de:acheteur:pl]]. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue [[du:espace_produits:Nom]]. Les compteurs [[de:activite:pl]] et [[de:labo:pl]] s'affichent sur la page [[Mon:activite:pl:Nom]], celui [[du:gerant:pl]] sur la page [[Nom:gerant:pl]]. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles.
- **[[Le:activite:pl]] (0 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque [[nom:activite]] vend, consomme et gère [[acc:stock:son propre:sa propre]] [[nom:stock]].
- **[[Le:labo:pl]] (0 à N)** : vos sites de production. [[Un:labo]] fabrique [[un:pt:pl]], approvisionne [[le:activite:pl]] qui lui sont [[acc:activite:rattaché:rattachée:pl]] **exclusivement par [[nom:transfert]]** — et, avec l'option [[Court:acheteur:pl]], vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| [[Nom:referentiel]] (unités, familles, catégories, [[nom:article:pl]]) | Compte | [[acc:referentiel:Défini:Définie]] une seule fois, [[acc:referentiel:partagé:partagée]] par tous les sites |
| Sélection [[de:article:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site n'utilise que [[le:article:pl]] qu'on lui a [[acc:article:assigné:assignée:pl]] |
| [[Nom:stock]], [[court:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site a les siens, suivis séparément |
| [[Nom:produit:pl]] et [[nom:fiche_technique:pl]] | [[Nom:activite]] / [[nom:labo]] | [[Un:produit]] est [[acc:produit:affecté:affectée]] aux sites qui [[acc:produit:le:la]] fabriquent ou [[acc:produit:le:la]] vendent |
| [[Nom:vente:pl]] et prix de vente | [[Nom:activite]] / [[nom:labo]] | Chaque [[nom:activite_desc]] a ses prix et [[son:vente:pl]] ; [[le:labo]] peut aussi saisir [[son:vente:pl]] [[acc:vente:direct:directe:pl]] |
| Carnet [[de:acheteur:pl]] et tarifs B2B | Compte | Communs à [[tous:labo:les]] ; [[le:vente:pl]] [[au:acheteur:pl]] partent [[du:stock]] d'[[un:labo]] |

### Le lien [[nom:activite]] ↔ [[nom:labo]]

Dès qu'[[un:labo]] existe sur votre compte, la création ou la modification d'[[un:activite]] vous propose deux options :

- **Avec [[nom:labo]]** : [[le:activite]] est [[acc:activite:rattaché:rattachée]] à [[un:labo]] qui l'approvisionne par [[nom:transfert]] — la production [[du:labo]] arrive dans [[le:stock]] de la boutique à chaque [[nom:transfert]].
- **Sans [[nom:labo]]** : [[le:activite]] gère [[acc:activite:seul:seule]] [[son:appro:pl]] auprès de [[son:fournisseur:pl]].

Une même entreprise peut mélanger les deux : des boutiques rattachées [[au:labo]] et [[un:activite_desc]] autonome, par exemple.

### La base [[court:acheteur:pl]] et le compte [[nom:depot]]

Avec l'**option [[Court:acheteur:pl]]**, [[le:labo]] ne fait pas que produire pour vos boutiques : [[acc:labo:il:elle]] vend aussi **directement aux professionnels** (épiceries, revendeurs, restaurants…). Le carnet [[de:acheteur:pl]], les tarifs B2B, les commandes et le portail en ligne sont réunis dans [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module).

- L'option nécessite **au moins [[un:labo]]** : [[le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]].
- Elle est facturée **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]].
- Un **compte [[nom:depot]]** est un compte **sans [[nom:activite]]** : [[un:labo]] + la base [[court:acheteur:pl]]. C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels. Son menu est allégé : sans [[nom:activite]], [[le:espace_vente:Nom]], [[le:transfert:pl:Nom]] et [[le:produit_vendable:pl:Titre]] sont masqués — ils réapparaissent automatiquement dès [[acc:activite:le premier:la première]] [[nom:activite]] [[acc:activite:créé:créée]].

### Quatre exemples concrets

- **Pâtisserie avec [[nom:labo]][[acc:labo: central:]]** : 1 [[nom:labo]] + 3 boutiques. [[Le:labo]] produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par [[nom:transfert]] et saisit ses propres [[nom:vente:pl]]. [[Le:referentiel]] (farine, beurre, sucre…) est [[acc:referentiel:commun:commune]] à tous.
- **Restaurant simple** : 1 [[nom:activite]], 0 [[nom:labo]]. Le restaurant fait ses achats, [[son:fiche_technique:pl]] et [[son:vente:pl]] ; le modèle reste le même, simplement sans [[Nom:espace_labo]].
- **Traiteur multi-sites** : 1 [[nom:labo]] de production + 2 [[nom:activite_desc:pl]]. [[Le:labo]] prépare, les sites vendent, et les rapports donnent la vision d'ensemble du compte.
- **Atelier en [[nom:depot]]** : 0 [[nom:activite]], 1 [[nom:labo]] + base [[court:acheteur:pl]]. L'atelier produit et vend exclusivement à ses clients professionnels, via [[le:espace_acheteurs:Nom]] et le portail de commande.

:::regle
[[Le:referentiel]] est [[acc:referentiel:commun:commune]] au compte ; [[le:stock:pl]] sont [[acc:stock:locaux:locales]] à chaque site. [[Un:article]] se crée une seule fois, mais [[son:stock]] et son prix moyen pondéré vivent séparément dans chaque [[nom:activite]] et chaque [[nom:labo]].
:::

:::attention
[[Un:pt]] d'origine [[nom:labo]] ne peut être [[acc:pt:approvisionné:approvisionnée]] côté [[nom:activite]] que par [[nom:transfert]] : pas de saisie d'achat directe pour [[ce:produit:pl]] en boutique. Voir [[[le:pt:pl]]](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [[[Nom:activite:pl]]](#activites) — l'écran de gestion de vos sites
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels
- [[[Nom:transfert:pl]]](#transferts)
- [Rôles & accès](#roles)
- [Calculs : [[le:transfert:pl]]](#calc-transferts)$m194_compte_activites_labos$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'compte-activites-labos'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'af0a2cc41080f241bfd6fc6159013bba';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte-activites-labos'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'compte-activites-labos'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]' WHERE slug = 'compte-activites-labos' AND titre = 'Le modèle : compte, activités, labos';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte-activites-labos' AND titre = 'Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]') THEN titres_gardes := titres_gardes || 'compte-activites-labos'::TEXT; END IF;
  -- ── configuration-vente ──
  t := $m194_configuration_vente$## 💲 Configuration [[Court:vente]]

Cet écran est le point de départ [[du:espace_vente:Nom]] : vous y choisissez les articles proposés [[au:vente]] et fixez leurs prix, pour [[le:vente]] [[acc:vente:direct:directe]] au comptoir comme pour chaque [[nom:prestataire]] de livraison. Vous le trouvez dans le menu **[[Nom:espace_vente]] → Configuration [[Court:vente]]**.

### Activer le module [[Court:vente]]

[[Le:espace_vente:Nom]] est une option de votre abonnement. Tant qu'[[acc:espace_vente:il:elle]] n'est pas [[acc:espace_vente:activé:activée]], un écran « Module [[Court:vente]] non activé » s'affiche à la place :

1. Cliquez sur **🚀 Demander l'activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l'envoi ; l'activation est réalisée par l'administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** : chaque [[nom:activite]] a sa propre configuration de prix.
- Deux raccourcis dans l'en-tête : **🛵 [[Pl:prestataire]]** et **🏗️ Charges**.
- Quatre onglets : **🛍️ [[Nom:vente]] [[Court:produit:pl]]**, **🧂 [[Pl:vente]] [[Court:supplement:pl]]** et **💎 [[Pl:vente]] [[acc:vente:Valorisés:Valorisées]]** (chacun avec son compteur d'articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie [[de:produit]]** avec les colonnes *[[Nom:produit]]*, *Vendable* (case à cocher), *🏪 Prix direct*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]].
- Une barre d'outils : recherche par nom, filtre par [[nom:prestataire]], bouton **✕ Réinitialiser**, compteur d'articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.

### Actions pas à pas

Rendre un article vendable et fixer son prix :

1. Cochez la case **Vendable** : l'article entre au catalogue [[de:vente]], encore inactif.
2. Saisissez son **prix direct** en DT, puis cliquez sur **💾 Enregistrer**.
3. Cochez à nouveau **Vendable** pour l'activer : tant qu'aucun prix supérieur à 0 n'est enregistré, la case reste bloquée.
4. Une fois l'article actif, saisissez si besoin un **prix dédié par [[nom:prestataire]]**, puis enregistrez.

Gérer les canaux [[nom:prestataire:pl]] (bouton **🛵 [[Pl:prestataire]]**) :

1. Sélectionnez [[le:activite]] [[acc:activite:concerné:concernée]].
2. Activez ou désactivez chaque [[nom:prestataire]] de livraison avec l'interrupteur ; le nombre [[de:prestataire:pl]] [[acc:prestataire:actif:active:pl]] s'affiche dans l'en-tête.
3. La liste [[du:prestataire:pl]] disponibles est gérée par l'administrateur : si elle est vide, contactez le [support](#support).

Consulter l'onglet **📋 Historique config** : chaque enregistrement de prix y est tracé ([[nom:produit]], type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d'attention

:::attention
Le prix de chaque [[nom:prestataire]] est **saisi manuellement**, article par article : il n'y a ni commission ni calcul automatique. Un prix [[nom:prestataire]] non renseigné empêche de valoriser correctement [[le:vente:pl]] [[acc:vente:passé:passée:pl]] par ce canal.
:::

:::attention
Sans [[nom:prestataire]] [[acc:prestataire:actif:active]] pour [[le:activite]], les colonnes [[nom:prestataire:pl]] n'apparaissent pas : un bandeau vous propose alors de configurer [[le:prestataire:pl]].
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de prix modifiés non sauvegardés : enregistrez avant de changer d'onglet ou [[de:activite]] pour ne rien perdre.
:::

### Voir aussi

- [Saisie [[du:vente:pl]]](#saisie-ventes) — utiliser ces prix au quotidien
- [[[Nom:produit_vendable:pl]]](#produits-vendables) et [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)$m194_configuration_vente$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'configuration-vente'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '5759814acdf37f3e4d4aa7a3bb409543';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'configuration-vente'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Configuration [[Court:vente]]' WHERE slug = 'configuration-vente' AND titre = 'Configuration Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente' AND titre = 'Configuration [[Court:vente]]') THEN titres_gardes := titres_gardes || 'configuration-vente'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_vente]]' WHERE slug = 'configuration-vente' AND partie = 'Espace Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente' AND partie = '[[Nom:espace_vente]]') THEN parties_gardees := parties_gardees || 'configuration-vente'::TEXT; END IF;
  -- ── dashboard ──
  t := $m194_dashboard$## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : [[nom:vente:pl]], [[nom:marge:pl]], achats, [[nom:stock:pl]], [[nom:perte:pl]] et [[nom:labo]], réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d'ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente, les alertes ([[nom:stock]] sous seuil, [[nom:food_cost]] [[acc:food_cost:élevé:élevée]] — au-delà du **seuil [[de:cout_matiere]] de votre domaine**, 40 % par défaut —, [[nom:inventaire]] [[acc:inventaire:ancien:ancienne]]) et la courbe d'évolution du CA et [[du:marge:pl]].
- **[[Nom:vente:pl]] & [[nom:marge:pl]]** — l'analyse fine de votre rentabilité : [[nom:marge:pl]] par canal de vente, par catégorie [[de:produit:pl]], par type ([[nom:produit:pl]], [[nom:supplement:pl]], valorisés), [[acc:marge:meilleurs:meilleures]] et plus faibles [[nom:marge:pl]], et le détail triable [[nom:produit]] par [[nom:produit]].
- **Achats & [[nom:stock]]** — vos achats par catégorie et par [[nom:fournisseur]], les réceptions en provenance [[du:labo]], la valeur [[du:stock]] par catégorie, les alertes de seuil détaillées et les [[acc:inventaire:derniers:dernières]] [[nom:inventaire:pl]].
- **[[Nom:perte:pl]]** — [[le:perte:pl]] **[[acc:perte:consolidé:consolidée:pl]] de [[votre:activite:pl]] et de [[votre:labo:pl]]** : par type (les types [[de:perte]] de votre domaine : avarie/déchet par défaut), par site, par catégorie, [[nom:article:pl]] les plus [[acc:article:perdu:perdue:pl]], et leur poids par rapport au CA.
- **[[Court:labo]]** — la production [[de:pt:pl]], [[le:transfert:pl]] [[acc:transfert:émis:émise:pl]] vers chaque [[nom:activite]], les cessions internes vers [[le:labo:pl]] [[acc:labo:rattaché:rattachée:pl]], [[le:stock]], [[le:perte:pl]] et [[le:vente:pl]] [[du:labo]]. (Cet onglet n'apparaît que si vous avez [[un:labo]].)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs ([[nom:activite:pl]], types de vente, [[nom:prestataire:pl]], catégories [[de:produit:pl]] ou [[de:article:pl]], familles, [[nom:fournisseur:pl]]…). Sans coche, tout est pris en compte. Les filtres proposés s'adaptent à l'onglet affiché.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *[[nom:marge:pl]] des catégories « Pâtisseries » et « Boissons » vendues via [[nom:prestataire]] sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l'adresse de la page peut être partagée telle quelle).

### [[Le:marge]] à trois étages

:::formule Du CA [[au:marge]] [[acc:marge:net:nette]]
[[Nom:marge]] [[acc:marge:brut:brute]] = CA − [[nom:cout_matiere]]
[[Nom:marge]] après commissions = [[nom:marge]] [[acc:marge:brut:brute]] − commissions [[nom:prestataire:pl]]
[[Nom:marge]] [[acc:marge:net estimé:nette estimée]] = [[nom:marge]] après commissions − prorata des charges fixes
note: commissions = taux configuré par [[nom:activite]] et [[nom:prestataire]] ; charges = charges fixes annuelles ramenées à la période.
:::

- [[Det:cout_matiere:le]]**[[nom:cout_matiere]]** de chaque [[nom:vente]] est [[acc:cout_matiere:figé:figée]] au moment [[du:vente]] (voir [Coût de revient d'[[un:recette]]](#calc-cout-recette)) ; le badge [[de:cout_matiere]] d'[[un:produit]] passe au vert, à l'orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).
- La **cascade** de l'onglet [[Nom:vente:pl]] & [[nom:marge:pl]] visualise chaque étage, du CA jusqu'[[au:marge]] [[acc:marge:net:nette]].

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l'onglet affiché, filtres compris.
:::

:::attention
[[Le:marge]] [[acc:marge:net:nette]] est une **estimation** : [[acc:marge:il:elle]] répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur [[du:stock]]](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie [[du:vente:pl]]](#saisie-ventes)$m194_dashboard$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'dashboard'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'b1e48a94da90522e7f1b4600f274f11a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'dashboard'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'dashboard'::TEXT;
  END IF;
  -- ── dashboard-gerant ──
  t := $m194_dashboard_gerant$## 🧑‍💼 Le tableau de bord côté [[nom:gerant]]

En tant que [[nom:gerant]], vous utilisez le **même tableau de bord** que le propriétaire du compte — voir [Tableau de bord](#dashboard) — automatiquement **limité à votre périmètre** : [[acc:activite:seuls:seules]] [[votre:activite:pl]] et [[nom:labo:pl]] affectés apparaissent dans les filtres et dans les chiffres.

:::regle
Les indicateurs, [[nom:marge:pl]] et alertes que vous voyez ne concernent que [[le:activite:pl]] et [[nom:labo:pl]] qui vous sont affectés.
:::$m194_dashboard_gerant$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'dashboard-gerant'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'b3f2a151edcc9c783d1967aa2d6774c2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'dashboard-gerant'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'dashboard-gerant'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Tableau de bord [[du:gerant]]' WHERE slug = 'dashboard-gerant' AND titre = 'Tableau de bord du gérant';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'dashboard-gerant' AND titre = 'Tableau de bord [[du:gerant]]') THEN titres_gardes := titres_gardes || 'dashboard-gerant'::TEXT; END IF;
  -- ── decouvrir-labflow ──
  t := $m194_decouvrir_labflow$## 🌟 LabFlow en un coup d'œil

LabFlow est une application de gestion dédiée aux métiers de bouche : restaurants, pâtisseries, traiteurs, cuisines centrales. Elle réunit dans un seul outil tout ce qui fait la rentabilité d'une cuisine professionnelle : [[le:referentiel]] [[de:article:pl]], [[le:fiche_technique:pl]] et [[le:cout_matiere]], [[le:stock:pl]] de chaque site, la production en [[nom:labo_long]], [[le:transfert:pl]] entre sites, [[le:vente:pl]] — au comptoir comme aux professionnels — et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise [[du:cout_matiere]]** : chaque [[nom:recette]] est [[acc:recette:décrit:décrite]] dans [[un:fiche_technique]] dont le coût de revient se calcule automatiquement à partir de vos prix d'achat réels. Quand un prix [[nom:fournisseur]] évolue, vos coûts suivent.
- **[[Un:stock:pl]] multi-sites** : chaque [[nom:activite_desc]] et chaque [[nom:labo]] dispose de [[acc:stock:son propre:sa propre]] [[nom:stock]], avec [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] et valeur [[de:stock]] suivis site par site.
- **La production en [[nom:labo_long]]** : [[le:labo]] fabrique [[votre:pt:pl]] (crèmes, pâtes, plats préparés…), [[le:ingredient:pl]] sont [[acc:ingredient:déduit:déduite:pl]] automatiquement, et les boutiques sont approvisionnées par [[nom:transfert]].
- **[[Le:vente]] aux professionnels (B2B)** : avec l'option [[Court:acheteur:pl]], [[votre:labo]] vend directement à un carnet de clients professionnels — tarifs dédiés, commandes en ligne via un portail, factures [[de:vente]].
- **La traçabilité** : chaque mouvement laisse une trace consultable — [[nom:appro:pl]], [[nom:perte:pl]], [[nom:transfert:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]] — avec filtres et exports dans les pages d'historique.
- **[[Le:vente:pl]] et [[le:marge:pl]]** : la saisie [[du:vente:pl]] déduit [[le:stock]] et alimente vos indicateurs : chiffre d'affaires, [[nom:food_cost]], [[nom:marge]] [[acc:marge:brut:brute]], valeur [[du:stock]], [[nom:perte:pl]], panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d'achat se saisissent en HT avec leur taux de TVA, et l'application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s'adapte à la taille de votre organisation grâce à un modèle unique : un compte regroupe [[acc:activite:un:une]] ou plusieurs **[[nom:activite:pl]]** (points de vente, cuisines) et, si besoin, [[acc:labo:un:une]] ou plusieurs **[[nom:labo:pl]]** de production.

- Le **restaurant indépendant** : [[acc:activite:un seul:une seule]] [[nom:activite]], tout se gère au même endroit.
- La **pâtisserie avec [[nom:labo_long]][[acc:labo_long: central:]]** : [[le:labo]] produit, les boutiques vendent, [[le:transfert:pl]] font le lien.
- Le **traiteur ou groupe multi-sites** : plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]] et ses prix de vente, et des rapports pour piloter l'ensemble.
- L'**atelier de production en [[nom:depot]]** : pas [[de:activite_desc]] — [[un:labo]] et un carnet [[de:acheteur:pl]] [[acc:acheteur:professionnel:professionnelle:pl]], avec commandes via le portail.

Le détail de ce modèle est expliqué dans [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos).

### Les grands modules

| Module | Ce qu'il couvre |
|---|---|
| [[Nom:referentiel]] | Unités, familles, catégories et [[nom:article:pl]] : la base commune de votre compte |
| Espace [[Nom:produit:pl]] | [[Nom:produit:pl]] vendables, utilisables et [[acc:produit:valorisé:valorisée:pl]], avec leurs [[nom:fiche_technique:pl]] |
| [[Nom:espace_activites]] | [[Nom:stock]], [[nom:appro:pl]], factures, [[nom:perte:pl]] et [[nom:inventaire:pl]] de chaque [[nom:activite_desc]] |
| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |
| [[Nom:espace_vente]] | Prix de vente, [[nom:prestataire:pl]], charges, saisie [[du:vente:pl]] et rapport [[de:vente]] |
| [[Nom:espace_acheteurs]] *(option)* | Carnet [[de:acheteur:pl]] B2B, tarifs dédiés, [[nom:vente:pl]] et commandes, portail en ligne, factures [[de:vente]] |
| Gestion | Tableau de bord, rapports, [[nom:fournisseur:pl]], [[nom:gerant:pl]], abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d'utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [[[Nom:fiche_technique:pl]]](#fiches-techniques)$m194_decouvrir_labflow$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'decouvrir-labflow'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4eeb4d0d7b29e690e7d1c149bd736a0a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'decouvrir-labflow'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'decouvrir-labflow'::TEXT;
  END IF;
  -- ── demarrage ──
  t := $m194_demarrage$## 🚀 Parcours de démarrage

LabFlow se découvre dans l'ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s'ouvre |
|---|---|
| Première connexion : changement du mot de passe | [[Mon:activite:pl:Nom]] |
| Création [[acc:activite:du premier:de la première]] [[nom:activite]] ou [[du:labo]] | [[Nom:referentiel]], Tableau de bord, Rapports, [[Nom:fournisseur:pl]], [[Nom:gerant:pl]] |
| Création [[acc:article:du premier:de la première]] [[nom:article]] [[au:referentiel]] | Espace [[Nom:produit:pl]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:sélectionné:sélectionnée]] pour [[un:activite]] | [[Nom:espace_activites]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:affecté:affectée]] [[au:labo]] | [[Nom:espace_labo]] |

[[Le:espace_vente:Nom]] apparaît quant à [[acc:espace_vente:lui:elle]] lorsque le module [[nom:vente]] est activé sur votre compte, qu'[[acc:article:un premier:une première]] [[nom:article]] existe [[au:referentiel]] **et qu'au moins [[un:activite]] est [[acc:activite:créé:créée]]** — [[acc:espace_vente:il:elle]] concerne [[le:vente]] [[du:activite:pl]] : un compte sans [[nom:activite]] ne [[acc:espace_vente:le:la]] voit pas, tout comme les liens [[Nom:transfert:pl]] et [[Titre:produit_vendable:pl]] ; [[le:espace_acheteurs:Nom]], dès que l'option [[Court:acheteur:pl]] est active. Dès la création de [[acc:activite:votre premier:votre première]] [[nom:activite]] ou de [[votre:labo]], l'application vous emmène automatiquement vers [[le:referentiel:Nom]], à la page Unités : c'est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos sites** — Dans **[[Mon:activite:pl:Nom]]**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut [[un:labo]]) pour créer [[votre:labo]] puis [[votre:activite:pl]] en deux étapes, ou « + Ajouter [[mon:activite]] » sinon — sur un **compte [[nom:depot]]** (sans [[nom:activite]]), le bouton devient « 🏭 Créer [[mon:labo]] ». Pour chaque [[nom:activite]] [[acc:activite:approvisionné:approvisionnée]] par [[le:labo]], choisissez l'option « Avec [[nom:labo]] ». Voir [[[Nom:activite:pl]]](#activites).
2. **Construisez [[le:referentiel]]** — Dans l'ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [[[Nom:article:pl]]](#referentiel-articles) avec leur prix d'achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez [[le:article:pl]]** — Indiquez [[acc:article:quels:quelles]] [[nom:article:pl]] sont [[acc:article:utilisé:utilisée:pl]] par chaque [[nom:activite]] et par [[le:labo]] : c'est cette affectation qui déverrouille les espaces correspondants. Voir [[det:article:le:pl]][[[Nom:article:pl]]](#referentiel-articles).
4. **Mettez [[votre:stock:pl]] à niveau** — Saisissez [[votre:appro:pl]] dans [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[Court:labo]]](#stock-labo) : quantités, prix, [[nom:fournisseur]]. C'est de là que viennent vos coûts réels.
5. **Créez [[votre:produit:pl]] et [[nom:fiche_technique:pl]]** — Dans l'Espace [[Nom:produit:pl]], composez [[votre:recette:pl]] : le coût de revient se calcule automatiquement. Voir [[[Nom:fiche_technique:pl]]](#fiches-techniques) et [le calcul du coût [[de:recette]]](#calc-cout-recette).
6. **Passez [[au:vente]]** — Configurez vos prix de vente ([Configuration [[Court:vente]]](#configuration-vente)) puis enregistrez [[votre:vente:pl]] ([Saisie [[du:vente:pl]]](#saisie-ventes)). Si l'option [[Court:acheteur:pl]] est active, configurez aussi vos [tarifs B2B](#acheteurs-tarifs) et votre [carnet [[de:acheteur:pl]]](#acheteurs-carnet).

### Points d'attention

:::attention
Tant qu'[[aucun:article]] n'est [[acc:article:assigné:assignée]] à [[un:activite]] ou [[au:labo]], les espaces correspondants restent verrouillés — même si [[votre:article:pl]] existent déjà [[au:referentiel]]. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d'abord toutes vos unités et familles avant d'attaquer [[le:article:pl]] : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Suivi de l'onboarding](#onboarding-suivi)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Rôles & accès](#roles)
- [FAQ](#faq)$m194_demarrage$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'demarrage'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '0d999b6ddd5b3b91e369c5a37d292049';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'demarrage'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'demarrage'::TEXT;
  END IF;
  -- ── factures ──
  t := $m194_factures$## 🧾 Factures [[de:appro]]

Ces écrans regroupent [[votre:appro:pl]] par **facture [[nom:fournisseur]]**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l'un pour [[det:activite:le:pl]]**[[nom:activite:pl]]** (menu [[Nom:stock]]) et l'autre pour [[det:labo:le]]**[[nom:labo]]** ([[nom:espace_labo]]), qui présente les mêmes informations à l'échelle [[du:labo_long]].

### Ce que vous voyez

En haut, des pastilles pour choisir [[le:activite]] 🏪 (ou [[le:labo]] 🏭). Puis la barre de filtres : période **Du / Au** (l'année en cours par défaut), **[[Nom:fournisseur]]** et **Réf. Facture** (recherche partielle) — l'écran [[compl:labo]] ajoute un filtre **Destination / Origine** pour isoler les factures liées à [[un:activite]] ou à [[un:labo]] ([[nom:transfert:pl]] [[acc:transfert:émis:émise:pl]] ou [[acc:transfert:reçu:reçue:pl]]).

Chaque facture est une carte repliée : [[nom:fournisseur]], référence, date, badge **[[acc:appro:Manuel:Manuelle]]**, **↗ [[Court:transfert]] [[acc:transfert:émis:émise]] → X** (cession vers [[un:activite]] ou [[un:labo]] [[acc:labo:rattaché:rattachée]]) ou **↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] ← X** (réception depuis [[le:labo]] qui vous alimente), et les montants **Total HT** et **Total TTC** en DT. Un clic déplie le détail ligne par ligne : [[nom:article]] (avec son unité), catégorie, quantité, prix HT à l'unité, taux de TVA, prix TTC à l'unité, totaux HT et TTC — suivi d'un sous-total par facture. Les colonnes TVA n'apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez [[le:activite]] (ou [[le:labo]]), puis la période.
2. Filtrez par [[nom:fournisseur]], ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

### Points d'attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de [[votre:appro:pl]]. C'est le **n° de facture saisi au moment [[du:appro:court]]** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque [[nom:article]].
:::

:::astuce
Les badges « ↗ [[Court:transfert]] [[acc:transfert:émis:émise]] » et « ↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] » signalent une facture interne issue d'[[un:transfert]] : côté destination ([[nom:activite]] ou [[nom:labo]]), [[le:fournisseur]] [[acc:fournisseur:affiché:affichée]] est alors [[det:labo:le]]**[[nom:labo]] source [[acc:labo:lui-même:elle-même]]**. Le filtre [[Nom:fournisseur]] de l'écran [[compl:activite:pl]] ne liste, lui, que [[votre:fournisseur:pl]] externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [[[Nom:fournisseur:pl]]](#fournisseurs)
- [[[Nom:transfert:pl]] [[nom:labo]] → [[nom:activite:pl]]](#transferts) · [Historique [[du:appro:pl]]](#historique)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) · [[[Nom:stock]] [[Court:labo]]](#stock-labo)$m194_factures$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'factures'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'dd7eda073df1efc741e41601bc2bf7ae';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'factures'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'factures'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Factures [[de:appro:court]]' WHERE slug = 'factures' AND titre = 'Factures d''appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'factures' AND titre = 'Factures [[de:appro:court]]') THEN titres_gardes := titres_gardes || 'factures'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'factures' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'factures' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'factures'::TEXT; END IF;
  -- ── faq ──
  t := $m194_faq$## ❓ Questions fréquentes

Les réponses courtes aux questions les plus posées. Pour le détail, suivez les liens vers les fiches concernées.

### Puis-je modifier [[un:appro]] déjà [[acc:appro:saisi:saisie]] ?

Oui, dans la plupart des cas : ouvrez l'[historique [[du:appro:pl]]](#historique) [[du:activite]] ou [[det:labo:du]][[[nom:labo]]](#stock-labo) [[acc:labo:concerné:concernée]] et corrigez la ligne. Attention : la correction recalcule le [prix moyen pondéré](#calc-pmp) [[du:article]], donc la valeur de [[votre:stock]] et les coûts qui en découlent peuvent évoluer — c'est normal (voir [Pourquoi mes chiffres ont changé ?](#faq-chiffres)).

### Pourquoi je ne peux pas supprimer [[ce:article]] ?

[[Un:article]] déjà [[acc:article:utilisé:utilisée]] — [[acc:article:présent:présente]] dans [[det:fiche_technique:un]][[[nom:fiche_technique]]](#fiches-techniques) ou dans vos historiques [[de:appro:pl]], [[de:stock:pl]] ou [[de:vente:pl]] — ne peut pas être [[acc:article:supprimé:supprimée]] : sa suppression casserait la traçabilité de vos coûts et de [[votre:stock:pl]]. Retirez-[[acc:article:le:la]] plutôt de [[votre:recette:pl]] [[acc:recette:actif:active:pl]] ; [[acc:article:il:elle]] restera visible dans les historiques.

### Comment ajouter [[un:activite]] ou [[un:labo]] ?

Si votre abonnement dispose encore de capacité, créez-les directement dans [[[Mon:activite:pl]]](#activites). Sinon, envoyez une demande d'**Ajout de capacité** depuis l'écran [Demandes](#support) : un avenant vous est envoyé par e-mail pour signature, et la capacité est ajoutée automatiquement dès la signature (voir [Avenants](#onboarding-avenants)).

### Pourquoi [[ce:produit]] n'est-[[acc:produit:il:elle]] pas approvisionnable directement dans [[mon:activite]] ?

C'est [[un:produit]] [[acc:produit:fabriqué:fabriquée]] par [[det:labo:votre]]**[[nom:labo]]** ([[nom:produit_utilisable]] d'origine [[nom:labo]] ou composé valorisé) : côté [[nom:activite]], [[acc:produit:il:elle]] n'entre en [[nom:stock]] que par **[[nom:transfert]]** depuis [[le:labo]], jamais par saisie directe [[de:appro]]. Voir [[[Nom:transfert:pl]]](#transferts) et [le lexique [[du:pt:pl]]](#lexique-pt).

### Que se passe-t-il si mon compte passe en lecture seule ?

Vous continuez à consulter tous vos écrans, historiques et rapports, mais toute saisie ([[nom:appro:pl]], [[nom:vente:pl]], [[nom:inventaire:pl]], productions…) est bloquée jusqu'à régularisation. Consultez votre [abonnement](#abonnement) et votre [historique de paiements](#historique-paiements), ou contactez l'équipe via [Demandes](#support).

### Comment retrouver une facture ?

Les **factures [[de:appro]]** se trouvent dans l'écran [Factures](#factures) de chaque [[nom:activite]] ou [[nom:labo]] : elles sont générées à la validation et re-téléchargeables à tout moment. Les **paiements d'abonnement** se consultent dans l'[historique des paiements](#historique-paiements). Vos **avenants signés** se téléchargent depuis l'écran [Demandes](#support).

### Pourquoi les montants sont-ils affichés en TTC alors que je saisis mes prix en HT ?

Vous saisissez les prix d'achat en HT avec leur taux de TVA ; LabFlow affiche ensuite les montants en TTC dans [[le:stock:pl]], [[le:pt:pl]], les rapports et les tableaux de bord, pour refléter ce que vous décaissez réellement. Détail dans [HT et TTC](#calc-ht-ttc).

### [[Le:stock]] [[acc:stock:affiché:affichée]] ne correspond pas à [[mon:stock]] [[acc:stock:réel:réelle]], que faire ?

Faites [[det:inventaire:un]][[[nom:inventaire]]](#inventaire) : comptez physiquement, saisissez les quantités constatées et validez. La validation enregistre les écarts et fait de votre comptage la **nouvelle référence** [[du:stock]]. Voir aussi [Pourquoi mes chiffres ont changé ?](#faq-chiffres).

### [[Un:gerant]] peut-[[acc:gerant:il:elle]] voir [[tous:activite:mes]] ?

Non. [[Un:gerant]] n'accède qu'[[au:activite:pl]] et [[nom:labo:pl]] que vous lui avez affectés, avec un périmètre d'écrans limité. Le propriétaire du compte garde seul la main sur l'abonnement, [[le:gerant:pl]] et la capacité. Voir [Rôles et accès](#roles) et [[[Nom:gerant:pl]]](#gerants).

### [[Un:article_ingredient]] n'existe pas dans [[votre:referentiel]], que faire ?

Vérifiez d'abord dans [[det:article:votre:pl]][[[Nom:article:pl]]](#referentiel-articles) qu'[[acc:article_ingredient:il:elle]] n'existe pas sous un autre nom ou une autre orthographe. [[acc:article_ingredient:S'il:Si elle]] manque réellement, envoyez une demande **Besoin d'aide** depuis l'écran [Demandes](#support) — ou créez [[le:article]] vous-même dans [[det:article:votre:pl]][[[Nom:article:pl]]](#referentiel-articles) : chaque compte gère [[acc:referentiel:son propre:sa propre]] [[nom:referentiel]].

### Quelle est la différence entre [[un:article]] et [[un:produit]] ?

[[Det:article:le]]**[[nom:article]]** est une matière première de [[det:referentiel:votre]][[[nom:referentiel]]](#referentiel-articles) : [[acc:article:il:elle]] s'achète, se stocke et possède un prix d'achat et un PMP. [[Det:produit:le]]**[[nom:produit]]** est ce que vous fabriquez ou vendez : [[acc:produit:il:elle]] possède [[det:fiche_technique:un]][[[nom:fiche_technique]]](#fiches-techniques) qui consomme [[un:article:pl]] — et parfois d'autres [[nom:produit:pl]]. Voir le [lexique](#lexique).

### Comment fonctionnent les alertes [[de:stock]] ?

Chaque [[nom:article]] peut avoir un seuil : en dessous, [[acc:article:il:elle]] apparaît en [[nom:stock]] critique. [[Le:pt:pl]] disposent d'un seuil propre à chaque [[nom:activite]]. Détail dans [Seuils et alertes](#calc-seuils).

### L'assistant IA a-t-il accès à mes données ?

Oui, mais uniquement à celles de **votre** compte : il s'en sert pour répondre à vos questions sur [[le:stock]], [[le:perte:pl]], [[le:inventaire:pl]]… Il doit d'abord être activé pour votre compte. Voir [Assistant IA](#assistant-ia).

### Comment déclarer [[un:perte]] ?

Depuis l'écran [[de:stock]] [[du:activite]] ([[[Nom:stock]] [[du:activite:pl]]](#stock-activites)) ou [[du:labo]] ([[[Nom:stock]] [[du:labo]]](#stock-labo)) : l'action **Enregistrer [[un:perte]]** sur la ligne [[du:article]] ou [[du:produit]] vous demande la quantité, le type [[de:perte]] (avarie ou déchet) et la date. [[Le:perte]] est [[acc:perte:déduit:déduite]] [[du:stock]] et [[acc:perte:valorisé:valorisée]] en TTC dans vos rapports — détail dans [[[Nom:perte:pl]]](#pertes).$m194_faq$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'faq'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '64662644991e01be00f7ff53136fa1ef';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'faq'::TEXT;
  END IF;
  -- ── faq-chiffres ──
  t := $m194_faq_chiffres$## 📊 Pourquoi mes chiffres ont changé ?

Une valeur [[de:stock]], un coût [[de:recette]] ou un montant de rapport n'est plus le même qu'hier ? Dans la grande majorité des cas, ce n'est pas une anomalie : voici les situations où les montants évoluent **légitimement**, et où regarder pour comprendre.

### 1. Vous avez validé [[un:inventaire]]

La validation d'[[det:inventaire:un]][[[nom:inventaire]]](#inventaire) remplace [[le:stock]] théorique par vos quantités comptées : c'est la **nouvelle référence**. Les écarts, positifs ou négatifs, sont enregistrés, et la [valeur [[de:stock]]](#calc-valeur-stock) est ajustée en conséquence. Les chiffres d'avant [[le:inventaire]] ne sont pas perdus : ils restent consultables dans l'historique.

### 2. Une [[court:appro]] passée a été modifiée

Corriger le prix ou la quantité d'[[un:appro]] déjà [[acc:appro:saisi:saisie]] recalcule le [prix moyen pondéré](#calc-pmp) [[du:article]]. Comme le PMP alimente la valeur [[de:stock]] et le [coût [[du:recette:pl]]](#calc-cout-recette), une correction sur une [[court:appro]] d'il y a trois semaines peut faire bouger vos coûts d'aujourd'hui. C'est le comportement attendu : le PMP reflète toujours la réalité corrigée de vos achats.

:::exemple
Vous aviez saisi 10 kg de beurre à 30 DT au lieu de 33 DT. Après correction, le PMP du beurre remonte légèrement — et le coût de [[tous:recette:les]] qui utilisent du beurre suit.
:::

### 3. [[Un:transfert]] a été [[acc:transfert:valorisé:valorisée]] au prix de cession

Quand [[le:labo]] transfère [[un:produit]] à [[un:activite]], [[le:activite]] [[acc:produit:le:la]] reçoit **au prix de cession**, pas [[au:cout_matiere]] [[du:labo]]. [[acc:produit:Le même:La même]] [[nom:produit]] peut donc « valoir » un montant [[au:labo]] et un autre dans [[le:activite]] : c'est le principe de la [valorisation [[du:transfert:pl]]](#calc-transferts), qui matérialise la valeur ajoutée [[du:labo]].

### 4. Vous comparez du HT et du TTC

Les prix d'achat se saisissent en HT avec leur taux de TVA, mais [[le:stock:pl]], [[nom:pt:pl]], rapports et tableaux de bord s'affichent en **TTC**. Si vous rapprochez un montant à l'écran d'une facture [[nom:fournisseur]] en HT, l'écart correspond simplement à la TVA. Détail dans [HT et TTC](#calc-ht-ttc).

### 5. Le prix figé des composés valorisés

Un composé valorisé — [[nom:produit_vendable]] [[acc:produit_vendable:fabriqué:fabriquée]] par [[le:labo]] — est valorisé à son **prix [[compl:labo]] défini**, volontairement figé : il ne suit pas [[le:cout_matiere]] au jour le jour. Si ce prix est modifié, seules les opérations **postérieures** utilisent le nouveau montant ; les mouvements passés conservent le prix en vigueur à leur date. Voir [Composés valorisés](#articles-valorises) et [Prix et valorisation](#calc-prix).

### 6. Deux productions identiques, deux coûts différents

Le coût d'une production [[de:pt]] est calculé avec le PMP [[du:ingredient:pl]] **au moment de la production**. Si le PMP a bougé entre deux fabrications — nouvelles [[court:appro:pl]], corrections —, deux lots identiques n'auront pas le même coût, sans qu'[[aucun:recette]] n'ait changé. Voir [Production [[du:pt:pl]]](#calc-production-pt).

:::regle
Un montant vous semble toujours inexpliqué après ces vérifications ? Consultez la [traçabilité](#calc-tracabilite) et les [historiques](#historique) pour retrouver l'opération à l'origine du changement, puis contactez le [support](#support) si le doute persiste.
:::

### Voir aussi

- [PMP](#calc-pmp) · [Valeur [[de:stock]]](#calc-valeur-stock) · [Coût [[de:recette]]](#calc-cout-recette)
- [[[Nom:transfert:pl]]](#calc-transferts) · [HT / TTC](#calc-ht-ttc) · [Production [[Court:pt]]](#calc-production-pt)
- [[[Nom:inventaire]]](#inventaire) · [Questions fréquentes](#faq)$m194_faq_chiffres$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'faq-chiffres'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '084886a5f10d38ade9b45278dafba54f';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq-chiffres'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'faq-chiffres'::TEXT;
  END IF;
  -- ── fiches-techniques ──
  t := $m194_fiches_techniques$## 📋 [[Titre:fiche_technique:pl]] & coût de revient

[[Le:fiche_technique]] détaille la **composition d'[[un:produit]]** et calcule son **coût de revient matière**. Vous y accédez par le bouton **Fiche tech.** présent sur chaque carte [[nom:produit]] — [[Titre:produit_vendable:pl]], [[Titre:produit_utilisable:pl]] et [[Titre:produit_valorise:pl]] [[acc:produit_valorise:composé:composée:pl]].

### Ce que vous voyez

La fenêtre [[Titre:fiche_technique]] affiche :

1. **La composition [[du:produit]]** : chaque [[nom:ingredient]] avec [[son:portion]] et son unité, et les sous-préparations (↳) avec leurs propres composants.
2. Le choix du mode : **📦 [[Court:fiche_technique]] [[Court:stock]]** (prix issus de [[votre:appro:pl]]) ou **✏️ [[Court:fiche_technique]] Manuel** (prix saisis à la main).
3. En [[Court:fiche_technique]] [[Court:stock]], la **base de prix** : cochez une ou plusieurs bases parmi [[det:activite:le:pl]]**[[nom:activite:pl]] et [[nom:labo:pl]] assignés** [[au:produit]], puis la ou les **méthodes** — **DP (Dernier Prix)** et/ou **PMP (Prix Moyen Pondéré)**.
4. Le **coût en temps réel, ligne par ligne** : une ligne par base et par méthode (ex. « 🏪 Boutique · PMP = 4.250 DT », « 🏭 [[Nom:labo]] · DP = 3.980 DT »). Un ⚠ signale les bases où [[un:article:pl]] n'ont pas encore [[de:appro]] (coût partiel).

### Les méthodes de valorisation

| Méthode | Principe |
|---|---|
| **DP** — Dernier Prix | Chaque [[nom:article]] est [[acc:article:valorisé:valorisée]] au prix TTC de [[acc:appro:son:sa]] **[[acc:appro:dernier:dernière]] [[nom:appro]]** |
| **PMP** — Prix Moyen Pondéré | Chaque [[nom:article]] est [[acc:article:valorisé:valorisée]] à la **moyenne pondérée des prix [[de:appro:court]] depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** |
| ✏️ [[Court:fiche_technique]] Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés **par base de prix**, avec leur date de mise à jour |

DP et PMP sont cumulables : chaque fichier Excel généré contient alors **deux onglets**, un par méthode.

### Actions pas à pas

**Générer une fiche sur les prix [[du:stock]]**

1. Choisissez **📦 [[Court:fiche_technique]] [[Court:stock]]**, puis cochez la ou les **bases de prix** ([[nom:activite:pl]] / [[nom:labo:pl]] assignés [[au:produit]]) et la ou les méthodes **DP / PMP**.
2. Contrôlez les coûts en temps réel, puis cliquez sur **Générer** : LabFlow produit **un fichier Excel par base sélectionnée** (deux bases = deux fichiers), chacun avec un onglet par méthode cochée, à la charte LabFlow.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ [[Court:fiche_technique]] Manuel** et sélectionnez la **base de prix** concernée — les prix manuels sont mémorisés séparément pour chaque base.
2. Cliquez **Saisir les prix manuels** : la fenêtre liste [[tous:article:les]] [[du:recette]], y compris [[acc:article:ceux:celles]] des sous-préparations (groupes indentés ↳), avec un champ de recherche. Tant qu'un prix est à 0, une alerte « Prix incomplets » bloque l'enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d'une ligne [[de:ingredient]]
Coût ligne = [[nom:portion]] × prix unitaire
note: [[Le:portion]] est [[acc:portion:exprimé:exprimée]] dans l'unité [[du:article]].
:::

:::formule Coût total [[du:produit]]
Coût total = Σ ( coûts [[du:article:pl]] ) + Σ ( [[nom:portion]] sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d'[[un:recette]]](#calc-cout-recette).
:::

### Points d'attention

:::regle
[[Un:produit]] **[[acc:produit:fabriqué:fabriquée]] [[au:labo]]** (composé valorisé) est [[acc:produit:limité:limitée]] [[au:transfert:pl]] côté [[nom:activite]] : seules ses **bases [[compl:labo]]** sont proposées pour [[le:fiche_technique]].
:::

:::attention
Une base dont [[acc:article:certain:certaine:pl]] [[nom:article:pl]] n'ont **pas [[de:appro]]** est signalée par un ⚠ : son coût affiché et exporté est **partiel** ([[nom:article:pl]] [[acc:article:manquant:manquante:pl]] [[acc:article:compté:comptée:pl]] à 0). Complétez [[votre:appro:pl:court]], ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et PMP** sur [[acc:produit:un même:une même]] [[nom:produit]] : un écart important signale des prix d'achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d'[[un:recette]]](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [[[Titre:produit_vendable:pl]]](#produits-vendables) et [[[Titre:produit_utilisable:pl]]](#produits-utilisables)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)$m194_fiches_techniques$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'fiches-techniques'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '8af0aa3b5c1f3d43bb05cff10ebdecf8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fiches-techniques'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fiches-techniques'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Titre:fiche_technique:pl]]' WHERE slug = 'fiches-techniques' AND titre = 'Fiches Techniques';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fiches-techniques' AND titre = '[[Titre:fiche_technique:pl]]') THEN titres_gardes := titres_gardes || 'fiches-techniques'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_produits]]' WHERE slug = 'fiches-techniques' AND partie = 'Espace Produit';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fiches-techniques' AND partie = '[[Nom:espace_produits]]') THEN parties_gardees := parties_gardees || 'fiches-techniques'::TEXT; END IF;
  -- ── fournisseurs ──
  t := $m194_fournisseurs$## 🚚 [[Nom:fournisseur:pl]]

Un seul écran gère [[votre:fournisseur:pl]] : **[[Nom:fournisseur:pl]]** (menu latéral 🚚) — le répertoire général du compte et ses affectations [[au:activite:pl]] **et [[au:labo:pl]]**.

### Ce que vous voyez

Le bandeau affiche le nombre total [[de:fournisseur:pl]]. La barre de filtres permet une recherche par nom, téléphone ou adresse, et porte les boutons **📥 Ajout Dynamique** et **+ [[Nouveau:fournisseur]]**. Le tableau principal présente :

| Colonne | Contenu |
|---|---|
| Nom | Nom [[du:fournisseur]] |
| Téléphone | Numéro de téléphone |
| Adresse | Adresse [[du:fournisseur]] |
| [[Pl:activite]] [[acc:activite:liés:liées]] | Pastilles [[du:activite:pl]] où [[acc:fournisseur:il:elle]] est [[acc:fournisseur:proposé:proposée]] [[au:appro:court]] |
| [[Court:labo:pl]] [[acc:labo:liés:liées]] | Pastilles 🏭 [[du:labo:pl]] où [[acc:fournisseur:il:elle]] est [[acc:fournisseur:proposé:proposée]] |
| [[Court:appro:pl]] | Nombre [[de:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]], détaillé par [[nom:activite]] |
| Actions | ✏️ modifier · 🗑️ supprimer (uniquement [[acc:fournisseur:s'il:si elle]] n'a [[aucun:appro:court]]) |

Le tableau est paginé par 10. Une section à part, **🏭 [[Pl:fournisseur]] [[Court:labo]] (auto-[[acc:fournisseur:gérés:gérées]])**, liste [[le:fournisseur:pl]] [[acc:fournisseur:créé:créée:pl]] automatiquement pour chaque [[nom:labo]] — c'est sous ce nom que les livraisons [[du:labo]] apparaissent dans [[le:appro:pl:court]] de [[votre:activite:pl]]. [[acc:fournisseur:Ils:Elles]] affichent leurs [[nom:activite:pl]] [[acc:activite:lié:liée:pl]] mais ne se modifient pas ici.

### Actions pas à pas

1. **Créer [[un:fournisseur]]** : *+ [[Nouveau:fournisseur]]* → nom (obligatoire), téléphone, adresse. À la création, [[tous:activite:vos]] sont [[acc:activite:coché:cochée:pl]] par défaut : décochez [[acc:activite:ceux:celles]] qui ne travaillent pas avec [[acc:fournisseur:lui:elle]], et cochez [[le:labo:pl]] [[acc:labo:concerné:concernée:pl]].
2. **Modifier les affectations** : ✏️ sur la ligne, puis cochez/décochez [[nom:activite:pl]] et [[nom:labo:pl]] — c'est ici que vous choisissez [[le:fournisseur:pl]] [[acc:fournisseur:proposé:proposée:pl]] [[au:appro]] de chaque [[nom:labo]].
3. **Supprimer** : le bouton 🗑️ n'apparaît que si [[le:fournisseur]] n'a servi à [[aucun:appro]] ; une confirmation est demandée.

### Ajout dynamique (import Excel)

Le bouton **📥 Ajout Dynamique** importe [[votre:fournisseur:pl]] en masse :

1. Téléchargez le **modèle Excel** (colonnes Nom / Téléphone / Adresse — seul le nom est obligatoire, 500 lignes maximum).
2. Remplissez-le, puis déposez le fichier dans la zone d'import.
3. Chaque [[nom:fournisseur]] [[acc:fournisseur:importé:importée]] est **automatiquement [[acc:fournisseur:assigné:assignée]] à l'ensemble de [[votre:activite:pl]] et [[nom:labo:pl]]** : [[acc:fournisseur:il:elle]] est immédiatement [[acc:fournisseur:proposé:proposée]] partout [[au:appro]]. Ajustez ensuite les affectations [[nom:fournisseur]] par [[nom:fournisseur]] (✏️) si nécessaire.

Le rapport d'import détaille chaque ligne : les noms déjà présents dans votre répertoire (ou en double dans le fichier) sont ignorés et signalés, le reste est créé.

### Points d'attention

:::attention
[[Un:fournisseur]] n'est [[acc:fournisseur:proposé:proposée]] [[au:appro]] que [[acc:fournisseur:s'il:si elle]] est [[acc:fournisseur:affecté:affectée]] [[au:activite]] ou [[au:labo]] [[acc:labo:concerné:concernée]]. Si vous ne [[acc:fournisseur:le:la]] voyez pas dans la liste au moment d'une saisie, vérifiez ses affectations ici.
:::

:::astuce
Renseignez le téléphone : il s'affiche dans les listes et facilite les commandes. La colonne [[Court:appro:pl]] vous montre d'un coup d'œil [[acc:fournisseur:quels:quelles]] [[nom:fournisseur:pl]] sont réellement [[acc:fournisseur:actif:active:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[du:labo]]](#stock-labo) — où l'on choisit [[le:fournisseur]] [[au:appro:court]]
- [Factures [[de:appro]]](#factures)
- [Historique des mouvements](#historique) · [[[Nom:transfert:pl]]](#transferts)$m194_fournisseurs$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'fournisseurs'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '20ccf4a49a0a4bc433eb4a04f497f92b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fournisseurs'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:fournisseur:pl]]' WHERE slug = 'fournisseurs' AND titre = 'Fournisseurs';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs' AND titre = '[[Nom:fournisseur:pl]]') THEN titres_gardes := titres_gardes || 'fournisseurs'::TEXT; END IF;
  -- ── gerants ──
  t := $m194_gerants$## 👥 Comptes [[court:gerant:pl]]

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
- [[[Nom:activite:pl]] & [[nom:labo:pl]]](#activites) · [Mon abonnement](#abonnement)$m194_gerants$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'gerants'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ec7ed82e7b5585ca34a6a6684498a00e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'gerants'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'gerants'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Comptes [[court:gerant:pl]]' WHERE slug = 'gerants' AND titre = 'Comptes gérants';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'gerants' AND titre = 'Comptes [[court:gerant:pl]]') THEN titres_gardes := titres_gardes || 'gerants'::TEXT; END IF;
  -- ── historique ──
  t := $m194_historique$## 🕑 Historiques

Tous les mouvements [[de:stock]] sont tracés et consultables : l'écran **Historique [[Court:appro]]** pour [[le:appro:pl]] et mouvements associés (achats, [[nom:transfert:pl]], [[nom:vente:pl]], productions), l'écran **Historique [[Court:perte:pl]]** pour les avaries et déchets. Vous y accédez depuis le menu [[Nom:espace_activites]] ; [[det:inventaire:le:pl]][[[nom:inventaire:pl]]](#inventaire) et [[det:transfert:le:pl]][[[nom:transfert:pl]]](#transferts) disposent de leurs propres historiques.

### Un fonctionnement commun

- Consultation **[[nom:activite]] par [[nom:activite]]** : sélectionnez [[le:activite_desc]] via les pastilles 🏪 — pas de vue globale « [[acc:activite:Tous:Toutes]] ». [[Un:gerant]] ne voit que [[son:activite:pl]] [[acc:activite:affecté:affectée:pl]].
- Une même **barre de filtres** : période **Du / Au** (année en cours par défaut), listes en cascade **Catégorie** puis **[[Nom:article]]**, bouton **Rechercher** (les résultats ne s'affichent qu'après), **Réinitialiser**, et l'export **Excel** (bouton « Exporter »), à la charte LabFlow (logo et mise en forme unifiés).
- Des **cases à cocher** sur chaque ligne : cochez des enregistrements pour les **surligner** (ambre) dans le fichier exporté — l'export garde toutes les lignes filtrées et le bouton indique alors « Exporter (N) ».
- La colonne **Créé par / Par** identifie l'auteur de chaque saisie ([traçabilité](#calc-tracabilite)).

### Historique [[du:appro:pl]]

Filtres spécifiques : **[[Nom:fournisseur]]** et **Type [[de:appro:court]]** (liste à cases multiples : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]], [[Court:vente]], [[Court:pt]]). Le filtre Catégorie propose, en plus de vos catégories [[de:article:pl]], les trois familles [[de:pt:pl]] : **[[Nom:cat_pt_utilisable]]**, **[[Nom:cat_pt_vendable]]** et **[[Nom:cat_pt_valorise]]** (voir [le lexique](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité · catégorie |
| Date | date + badge du type : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]] (côté [[nom:labo]] : « ↗ [[Nom:transfert_abr]] → X » pour un envoi, « ↙ [[acc:transfert:Reçu:Reçue]] ← X » pour une réception depuis [[le:labo]] qui vous alimente), 💰 [[Court:vente]], ↩️ Annul. [[court:vente]], 🔄 [[Court:pt]] |
| Quantité | quantité et unité |
| Prix HT | montant total HT et prix unitaire |
| TVA | taux appliqué |
| Prix TTC | montant total TTC et prix unitaire |
| Fourn. / Réf | [[nom:fournisseur]] et n° de facture (pour [[un:transfert]] : la destination ou [[le:labo]] source) |
| Créé par | auteur de la saisie |

Le pied de tableau cumule les **totaux HT et TTC en DT** des résultats affichés ; la liste est paginée par 10 lignes.

### Actions pas à pas : corriger ou supprimer [[un:appro:court]]

1. Cliquez sur **✏️** : vous pouvez modifier la quantité, le prix unitaire, [[le:fournisseur]] et la réf. facture — la **date reste verrouillée**.
2. Une ligne de type **[[Nom:transfert]]** (envoi ou réception) ne se modifie ni ne se supprime ici : passez par l'**Historique [[Court:transfert:pl]]** [[du:labo]] [[acc:labo:émetteur:émettrice]] ([[[Nom:transfert:pl]]](#transferts)), qui ajuste les deux [[nom:stock:pl]].
3. **🗑️ Supprimer** : [[le:stock]] [[du:article]] est [[acc:stock:recalculé:recalculée]]. L'action est **irréversible**.

### Historique [[du:perte:pl]]

Filtre supplémentaire **Type** (les types [[de:perte]] de votre domaine : Avarie / Déchet par défaut), badges colorés par type, totaux **quantité** et **coût total**, même export Excel. La modification et la suppression y suivent les mêmes garde-fous — le détail est décrit dans la fiche [[[Nom:perte:pl]]](#pertes).

### Points d'attention

:::attention
Les lignes 💰 [[Court:vente]] et ↩️ Annul. [[court:vente]] sont générées automatiquement par [[votre:vente:pl]] : elles ne peuvent être ni modifiées ni supprimées depuis l'historique. [[Un:gerant]] ne peut corriger que les saisies qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] créées.
:::

:::astuce
Pour préparer une clôture mensuelle, réglez Du / Au sur le mois, lancez Rechercher, vérifiez les totaux HT/TTC puis exportez en Excel. Le filtre Type [[de:appro:court]] isole en un clic les seuls achats « [[acc:appro:Manuel:Manuelle]] », hors [[nom:transfert:pl]] et [[nom:vente:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:perte:pl]]](#pertes) · [[[Nom:inventaire]]](#inventaire) · [[[Nom:transfert:pl]]](#transferts)
- [HT et TTC](#calc-ht-ttc) · [Traçabilité des mouvements](#calc-tracabilite)$m194_historique$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'historique'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '68320356ff18cde19237256a09e0f57d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'historique'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'historique'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'historique' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'historique' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'historique'::TEXT; END IF;
  -- ── inventaire ──
  t := $m194_inventaire$## 🔢 [[Nom:inventaire]]

L'écran **[[Nom:inventaire]]** sert à compter physiquement [[votre:stock]] et à enregistrer les quantités réelles : elles remplacent [[le:stock]] théorique [[acc:stock:calculé:calculée]] par l'application et deviennent la nouvelle référence. Vous y accédez depuis le menu **[[Nom:espace_activites]] → [[Nom:inventaire]]**, [[nom:activite]] par [[nom:activite]] (pastilles 🏪).

### Ce que vous voyez

- Un en-tête avec compteurs : nombre [[det:article_ingredient:de:pl]]**[[Nom:article_ingredient:pl]]**, lignes saisies (compteur **[[acc:article_ingredient:Saisis:Saisies]]**), et alerte **⚠ Date existante** si [[un:inventaire]] existe déjà à la date choisie.
- Une barre de filtres : **Catégorie**, **[[Nom:article_ingredient]]** (après choix d'une catégorie), **Date [[court:inventaire]]** (aujourd'hui par défaut, jamais dans le futur), et le bouton **Enregistrer (N)**.
- Un tableau groupé par catégories repliables (avec compteur [[de:article_ingredient:pl]] et de lignes saisies) :

| Colonne | Contenu |
|---|---|
| [[Nom:article_ingredient]] | nom (badge **[[Court:pt]]** pour [[un:pt]]), unité, lien 📋 « 5 derniers inv. » |
| [[Nom:stock]] [[acc:stock:actuel:actuelle]] | [[nom:stock]] théorique [[acc:stock:calculé:calculée]] par l'application |
| Qté réelle | saisie de la quantité réellement comptée |

- Un panneau flottant **Aperçu saisie** (en bas à droite) récapitule les lignes saisies avec l'écart par rapport [[au:stock]] théorique (en vert si positif, en rouge si négatif).

### Actions pas à pas

1. Sélectionnez [[le:activite]], puis la **date [[de:inventaire]]**.
2. Ouvrez les catégories et saisissez la **quantité réelle comptée** pour chaque [[nom:article_ingredient]] [[acc:article_ingredient:concerné:concernée]] — il n'est pas obligatoire de tout compter, seules les lignes saisies sont enregistrées.
3. Contrôlez les écarts dans l'aperçu flottant.
4. Cliquez sur **Enregistrer (N)** : une fenêtre de confirmation liste les lignes et rappelle que [[le:inventaire]] **ne peut pas être [[acc:inventaire:supprimé:supprimée]]**, seulement [[acc:inventaire:modifié:modifiée]], et qu'[[acc:inventaire:il:elle]] **recalcule [[le:stock]] à partir de sa date**.
5. Confirmez : le message « [[Nom:inventaire]] [[acc:inventaire:enregistré:enregistrée]] avec succès » s'affiche.

Si [[un:inventaire]] existe déjà à la date choisie pour [[un:article_ingredient]], sa ligne porte un badge **⚠ DATE** et la confirmation devient « 🚨 Remplacement détecté » : l'ancienne valeur, barrée, et la nouvelle sont affichées côte à côte avant que vous ne validiez le remplacement.

### L'impact sur vos calculs

:::formule Écart [[de:inventaire]]
Écart = Quantité réelle comptée − [[Nom:stock]] théorique
note: Un écart négatif révèle [[un:perte:pl]] ou consommations non saisies ; un écart positif, un surplus.
:::

:::regle
[[Le:inventaire]] devient le **point de départ** des calculs : [[le:stock]] repart de la quantité comptée, puis les mouvements postérieurs ([[court:appro:pl]], [[nom:transfert:pl]], [[nom:perte:pl]], productions, [[nom:vente:pl]]) s'y ajoutent ou s'en retranchent. Le détail est expliqué dans [la valeur [[du:stock]]](#calc-valeur-stock). La date et la quantité [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]] s'affichent d'ailleurs sous chaque [[nom:article]] dans [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites).
:::

### Consulter et corriger [[le:inventaire:pl]] [[acc:inventaire:passé:passée:pl]]

L'écran **Historique [[Court:inventaire]]** liste tous les comptages : filtres **Du / Au**, **Catégorie** et **[[Nom:article]]**, export **Excel** (les lignes cochées y sont surlignées), colonnes [[Nom:article]] (badge [[Court:pt]]), Date, Qté réelle, Note et Par (auteur de la saisie). Le bouton **✏️ Modifier** permet de corriger la quantité et la note — la date, elle, ne peut pas être modifiée. [[Un:gerant]] ne peut corriger que ses propres saisies.

### Points d'attention

:::attention
[[Un:inventaire]] est [[acc:inventaire:définitif:définitive]] : [[acc:inventaire:il:elle]] ne se supprime pas. En cas d'erreur, corrigez la quantité depuis l'historique, ou enregistrez [[acc:inventaire:un:une]] [[nouveau:inventaire]] à une date plus récente.
:::

:::astuce
Réalisez [[un:inventaire:pl]] [[acc:inventaire:régulier:régulière:pl]] (hebdomadaires ou [[acc:inventaire:mensuel:mensuelle:pl]]) : [[acc:inventaire:il:elle:pl]] fiabilisent la valeur [[du:stock]] et font apparaître [[le:perte:pl]] [[acc:perte:oublié:oubliée:pl]]. Le lien « 5 derniers inv. » sous chaque [[nom:article_ingredient]] aide à repérer les dérives d'un comptage à l'autre.
:::

### Voir aussi

- [Valeur [[du:stock]]](#calc-valeur-stock) · [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique)$m194_inventaire$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'inventaire'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '7d845f04cc81376cce7bfd52c5f3d1e8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'inventaire'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'inventaire'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:inventaire]]' WHERE slug = 'inventaire' AND titre = 'Inventaire';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'inventaire' AND titre = '[[Nom:inventaire]]') THEN titres_gardes := titres_gardes || 'inventaire'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'inventaire' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'inventaire' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'inventaire'::TEXT; END IF;
  -- ── lexique ──
  t := $m194_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **[[Nom:acheteur]]** | Client professionnel (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : épicerie, revendeur, restaurant… Il peut être invité sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **[[Nom:activite]]** | [[Nom:activite_desc]] ou cuisine [[acc:activite_desc:exploité:exploitée]] par votre compte : restaurant, pâtisserie, kiosque… Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **[[Court:appro]] (approvisionnement)** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro:court]] peut provenir d'un achat auprès d'[[un:fournisseur]], d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (farine, beurre, boisson…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
| **Avenant** | Modification de votre contrat d'abonnement : ajout [[de:activite:pl]], [[de:labo:pl]] ou [[de:gerant:pl]], activation ou changement de palier de l'option [[Court:acheteur:pl]]… L'avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Base [[court:acheteur:pl]] (option [[Court:acheteur:pl]])** | Option de l'abonnement qui active [[le:espace_acheteurs:Nom]]. Elle est facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]]. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. |
| **Catégorie** | Deux notions distinctes : la *catégorie [[de:article:pl]]* ([[nom:referentiel]]) affine une famille (ex. « Volaille » dans la famille « Viandes ») ; la *catégorie [[de:produit:pl]]* ([[Nom:espace_produits]]) classe ce qui se vend (ex. « Desserts ») et est typée vendable, [[nom:supplement]] ou valorisé. |
| **Charge** | Dépense d'exploitation hors matière première : énergie, emballages, main-d'œuvre… Saisie dans [[le:espace_vente:Nom]], elle affine l'analyse de rentabilité au-delà [[acc:cout_matiere:du seul:de la seule]] [[nom:cout_matiere]]. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et [[le:cout_matiere]] d'[[un:produit]]. Un plat dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Commande [[compl:acheteur]]** | Commande passée par [[un:acheteur]] depuis son portail, ou saisie directement en [[nom:vente]] [[acc:vente:manuel:manuelle]]. Elle suit quatre états : en attente → expédiée ([[le:stock]] [[du:labo]] est [[acc:stock:déduit:déduite]] et la facture émise) → livrée ; une commande peut être annulée, [[le:stock]] est alors [[acc:stock:réintégré:réintégrée]]. |
| **Composé valorisé** | [[Nom:pt]] [[acc:pt:fabriqué:fabriquée]] [[au:labo]] puis [[acc:pt:transféré:transférée]] vers [[le:activite:pl]], où [[acc:pt:il:elle]] se vend [[acc:pt:tel quel:telle quelle]] (ex. un entremets fabriqué [[au:labo]] et revendu en boutique). Son prix de revient est figé au coût [[du:labo]] au moment de la production. |
| **Compte [[nom:depot]]** | Compte sans [[nom:activite_desc]] : [[un:labo]] et la base [[court:acheteur:pl]]. [[Le:labo]] produit et vend directement aux professionnels — c'est le modèle de l'atelier ou [[du:depot]] de production. |
| **Domaine d'activité** | Secteur métier de votre compte (restauration, pâtisserie, café…). Il détermine le catalogue [[de:article:pl]] qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories [[de:article:pl]] (« Viandes », « Boissons »…) portant deux propriétés clés : *consommable* (utilisé en cuisine) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque [[nom:article]] peut être [[acc:article:utilisé:utilisée]]. |
| **[[Nom:fiche_technique]]** | [[Nom:recette]] [[acc:recette:chiffré:chiffrée]] d'[[un:produit]] : liste [[un:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]], et calcul automatique du coût de revient matière. C'est l'outil central du chiffrage de votre carte. |
| **[[Nom:food_cost]] ([[nom:cout_matiere]])** | Coût des matières premières consommées pour produire un plat, souvent rapporté à son prix de vente. Un plat vendu 15 DT dont [[le:ingredient:pl]] coûtent 4,500 DT a [[un:food_cost]] de 30 %. |
| **Formule d'activités** | Niveau d'abonnement de [[votre:activite:pl]]. *Activité Basique* : [[nom:stock]], [[nom:appro:pl]] et [[nom:vente:pl]] [[de:article:pl]] [[acc:article:valorisé:valorisée:pl]], sans [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]]. *Activité Premium* : tout LabFlow, y compris [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]] et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **[[Nom:fournisseur]]** | Tiers auprès duquel vous achetez vos marchandises. Il est associé [[au:appro:pl]] et aux factures pour tracer l'origine de chaque achat. |
| **[[Nom:gerant]]** | Utilisateur délégué par le propriétaire du compte. Son accès est limité [[au:activite:pl]] et [[au:labo:pl]] qui lui sont affectés. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant ([[nom:stock]], [[nom:pt:pl]], rapports, tableaux de bord) est en TTC. |
| **[[Nom:inventaire]]** | Comptage physique [[du:stock]] à une date donnée. La quantité réelle saisie devient la nouvelle référence [[du:stock]] ; [[le:stock]] théorique [[acc:stock:affiché:affichée]] pendant la saisie permet de repérer les écarts. |
| **[[Nom:labo]]** | [[Nom:labo_long]][[acc:labo_long: central:]] de production [[acc:labo_long:rattaché:rattachée]] au compte. [[acc:labo_long:Il:Elle]] achète et fabrique en gros, alimente [[le:activite:pl]] par [[nom:transfert]] — et, si l'option [[Court:acheteur:pl]] est active, vend directement aux professionnels. Un compte peut avoir zéro, [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]. |
| **[[Nom:marge]]** | Différence entre le prix de vente et [[le:cout_matiere]]. Un dessert vendu 8 DT avec 2 DT de matière dégage 6 DT [[de:marge]] [[acc:marge:brut:brute]]. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **[[Nom:perte]] (avarie / déchet)** | Marchandise sortie [[du:stock]] sans être vendue : *avarie* ([[nom:produit]] [[acc:produit:périmé:périmée]], [[acc:produit:abîmé:abîmée]], impropre) ou *déchet* (parures, casse, ratés de production). Chaque [[nom:perte]] est [[acc:perte:valorisé:valorisée]] en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'[[un:article]], pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser [[le:stock]] et [[le:transfert:pl]]. |
| **Portail [[court:acheteur]]** | Espace en ligne dédié à chaque [[nom:acheteur]] [[acc:acheteur:invité:invitée]] : [[acc:acheteur:il:elle]] y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. [[acc:acheteur:Il:Elle]] ne voit jamais vos quantités en [[nom:stock]] ; le vendeur ajuste les quantités, ou retire des lignes, à l'expédition. |
| **[[Nom:prestataire]]** | Canal de vente tiers (plateforme de livraison, revendeur…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration [[de:vente]]. |
| **[[Nom:pt]] ([[court:pt]])** | [[Nom:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : sa production déduit automatiquement [[le:ingredient:pl]] et sous-préparations consommés. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **[[Nom:produit_utilisable]]** | [[Nom:pt]] intermédiaire, non [[acc:pt:vendu:vendue]] [[acc:pt:tel quel:telle quelle]], [[acc:pt:réutilisé:réutilisée]] dans d'autres [[nom:recette:pl]] : crème pâtissière, sauce de base, pâte… Son coût se répercute automatiquement dans [[tous:produit:les]] qui l'utilisent. |
| **[[Nom:produit_valorise]]** | [[Nom:produit]] [[acc:produit:vendu:vendue]] [[acc:produit:tel quel:telle quelle]], sans décomposition [[de:recette]] au moment [[du:vente]] : [[nom:article]] de revente (ex. boisson en bouteille) ou [[nom:produit_compose]] [[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]. |
| **[[Nom:produit_vendable]]** | [[Nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:défini:définie]] par [[un:fiche_technique]] et [[acc:produit:vendu:vendue]] par [[un:activite]] : plat, dessert, formule… [[acc:produit:Il:Elle]] est obligatoirement [[acc:produit:rattaché:rattachée]] à une catégorie [[de:produit]]. |
| **PV (prix de vente)** | Prix auquel [[un:produit]] est [[acc:produit:vendu:vendue]] au client. LabFlow distingue le prix direct ([[nom:vente]] au comptoir) et les prix propres à chaque [[nom:prestataire]]. |
| **[[Nom:recette]]** | Composition d'[[un:produit]] : [[nom:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]]. Elle sert à la fois au calcul du coût de revient et à la déduction [[du:stock]]. |
| **[[Nom:referentiel]]** | Socle de données du compte : unités, familles, catégories et [[nom:article:pl]]. Tout le reste ([[nom:stock]], [[nom:recette:pl]], [[nom:vente:pl]]) s'appuie dessus. |
| **Seuil d'alerte** | Quantité minimale définie pour [[un:article]] ou [[un:pt]] : lorsque [[le:stock]] passe en dessous, la ligne est signalée pour réapprovisionnement. Pour [[le:pt:pl]], le seuil se règle par [[nom:activite]]. |
| **[[Nom:stock]] théorique** | [[Nom:stock]] [[acc:stock:calculé:calculée]] par l'application : [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] + [[nom:appro:pl]] − [[nom:perte:pl]] − [[nom:transfert:pl]] [[acc:transfert:sortant:sortante:pl]] − consommations ([[nom:vente:pl]], productions). [[Le:inventaire]] [[acc:stock:le:la]] réconcilie avec [[le:stock]] [[acc:stock:réel:réelle]] [[acc:stock:compté:comptée]]. |
| **[[Nom:supplement]]** | [[Nom:produit_vendable]] complémentaire [[acc:produit_vendable:proposé:proposée]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] : sauce, garniture, extra… [[acc:produit_vendable:Il:Elle]] a [[acc:fiche_technique:son propre:sa propre]] [[nom:fiche_technique]] et son propre prix de vente. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture [[de:vente]] [[au:acheteur:pl]] (montant fixe en DT, désactivable [[au:vente]]). |
| **[[Nom:transfert]]** | Mouvement de marchandise [[du:labo]] vers [[un:activite]] : [[le:stock]] [[du:labo]] diminue, [[acc:stock:celui:celle]] [[du:activite]] augmente, au coût [[du:labo]]. C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], [[un:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]]. |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit [[au:appro]], [[nom:article]] par [[nom:article]], et sert au calcul des prix TTC. |
| **Unité** | Unité de mesure d'[[un:article]] : kg, litre, gramme, pièce, portion… Utilisez la même unité à l'achat et en [[nom:recette]] pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur [[du:stock]], d'[[un:perte]] ou d'une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût [[de:recette]]). |

### Voir aussi

- [Les 3 catégories [[de:pt:pl]]](#lexique-pt) — le détail [[un:pt:pl:court]] utilisables, vendables et [[acc:pt:composés valorisés:composées valorisées]]
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels de A à Z
- [Un compte, [[un:activite:pl]], [[un:labo:pl]]](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'[[un:recette]]](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$m194_lexique$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'lexique'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '57bc637719685b0fb5cba6bb34fdf0aa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'lexique'::TEXT;
  END IF;
  -- ── lexique-pt ──
  t := $m194_lexique_pt$## 🧩 Les 3 catégories [[de:pt:pl]]

[[Det:pt:un]]**[[avecCourt:pt]]** est [[un:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : quand vous en produisez, LabFlow déduit automatiquement [[du:stock]] [[le:article:pl]] et les sous-préparations [[acc:article:consommé:consommée:pl]]. [[Tous:pt:les:court]] ne jouent pas le même rôle : l'application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « [[Nom:cat_pt_utilisable]] », « [[Nom:cat_pt_vendable]] » et « [[Nom:cat_pt_valorise]] ».

### Vue d'ensemble

| Catégorie | Où on le produit | Où on le vend | Comment il arrive en [[nom:stock]] |
|---|---|---|---|
| **Utilisable** (ex. crème pâtissière) | Dans [[le:activite]] ou [[au:labo]], selon les affectations [[du:produit]] | Nulle part : [[acc:produit:il:elle]] est [[acc:produit:consommé:consommée]] dans [[le:recette:pl]] d'autres [[nom:produit:pl]] | Production sur place (saisie de la quantité produite) ou [[nom:transfert]] depuis [[le:labo]] ; [[acc:produit:certains:certaines]] sont [[acc:produit:limités:limitées]] [[au:transfert]] |
| **Vendable** (ex. tarte au citron) | Dans [[le:activite]] | Par [[le:activite]], lors de la saisie [[un:vente:pl]] | Production dans [[le:activite]], si le suivi [[de:stock]] est activé pour [[ce:produit]] ([[un:labo]] peut aussi [[acc:produit:le:la]] gérer et l'envoyer par [[nom:transfert]]) |
| **Composé valorisé** (ex. entremets fabriqué [[au:labo]]) | [[Au:labo]] uniquement | Par [[le:activite:pl]], tel quel, comme [[un:produit_valorise]] | Uniquement par [[nom:transfert]] depuis [[le:labo]] |

### 1. Les Utilisables — les intermédiaires de [[votre:recette:pl]]

[[Un:produit_utilisable]] est une **préparation intermédiaire** : crème pâtissière, sauce de base, pâte, fond… [[acc:produit_utilisable:Il:Elle]] n'est jamais [[acc:produit_utilisable:vendu:vendue]] [[acc:produit_utilisable:tel quel:telle quelle]] : [[acc:produit_utilisable:il:elle]] entre dans la composition [[un:produit_vendable:pl]], des composés valorisés, ou même d'autres [[nom:produit_utilisable:pl]] (sous-préparations).

Son **mode [[de:appro]]** se choisit à la création [[du:produit]] : soit chaque [[nom:activite]] peut [[acc:produit:le:la]] produire librement sur place, soit [[acc:produit:il:elle]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] et [[le:activite:pl]] [[acc:produit:le:la]] reçoivent **uniquement par [[nom:transfert]]**. Dans ce second cas, la ligne [[du:stock]] [[du:activite]] porte l'indicateur « ⇄ [[Court:transfert]] uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — [[le:produit:pl]] [[acc:produit:fini:finie:pl]] [[du:activite]]

[[Un:pt:court]] vendable est [[det:produit:un]]**[[nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:vendu:vendue]] par [[le:activite]]** : tarte, plat cuisiné, dessert… [[acc:pt:Il:Elle]] est [[acc:pt:défini:définie]] par [[un:fiche_technique]] et [[acc:pt:rattaché:rattachée]] obligatoirement à une catégorie [[de:produit]]. Le suivi en [[nom:stock]] est **optionnel** : activé [[nom:produit]] par [[nom:produit]], il permet de produire à l'avance (la production déduit [[le:ingredient:pl]] [[du:recette]]) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués [[au:labo]], vendus tels quels

[[Un:produit_compose]] [[acc:produit_compose:valorisé:valorisée]] est **[[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]** à partir d'[[un:recette]] ([[nom:article:pl]] et [[nom:produit_utilisable:pl]] [[du:labo]]), puis **[[acc:produit_compose:transféré:transférée]]** vers [[le:activite:pl]] qui [[acc:produit_compose:le:la]] vendent **[[acc:produit_compose:tel quel:telle quelle]]**, comme [[un:produit_valorise]]. [[acc:produit_compose:Il:Elle]] se gère depuis l'écran [[det:produit_valorise:un:pl]][[[Nom:produit_valorise:pl]]](#articles-valorises), dans l'onglet « Composés », qui n'apparaît que si votre compte possède au moins [[un:labo]].

:::regle
Son coût se calcule sur les **prix d'achat [[du:labo]]** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix [[du:labo]] ne modifient pas la valeur des lots déjà produits. Côté [[nom:activite]], [[acc:produit_compose:il:elle]] n'arrive en [[nom:stock]] **que par [[nom:transfert]]** — jamais par saisie directe.
:::

Dans [[le:stock]] [[du:labo]], [[ce:produit:pl]] sont repérables au badge « ◆ Composé valorisé ».

### Comment [[un:pt:court]] arrive en [[nom:stock]]

1. **Production** : dans l'écran [[de:stock]] ([[nom:activite]] ou [[nom:labo]]), saisissez la quantité produite sur la ligne [[du:pt:court]]. Aucun prix n'est demandé : le coût [[du:recette]] est calculé automatiquement (en TTC) et [[le:ingredient:pl]] — y compris les sous-préparations — sont [[acc:ingredient:déduit:déduite:pl]] [[du:stock]].
2. **[[Nom:transfert]]** : pour [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]], [[le:transfert]] diminue [[le:stock]] [[du:labo]] et augmente [[acc:stock:celui:celle]] [[du:activite]], au coût [[du:labo]].

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom [[du:produit]] et de l'année : initiales de chaque mot pour un nom multi-mots (« Crème Pâtissière » produit en 2026 donne CP-26), trois premières lettres pour un nom d'un seul mot (« Cookies » donne COO-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez [[le:stock]] de [[votre:ingredient:pl]] avant de lancer une production : les quantités consommées par [[le:recette]] sont déduites immédiatement. Dans la colonne [[du:stock]] [[acc:stock:actuel:actuelle]], la ventilation détaille d'ailleurs les mouvements : [[court:appro]], [[nom:transfert:pl]], [[nom:perte:pl]] et consommation [[court:pt]].
:::

### Qui apparaît où

- **Dans [[le:stock:pl]]** : [[le:pt:pl:court]] figurent aux côtés [[un:article:pl]], [[acc:pt:regroupé:regroupée:pl]] dans leur catégorie. Côté [[nom:activite]], [[le:pt:pl:court]] d'origine [[nom:labo]] affichent « ⇄ [[Court:transfert]] uniquement » ; côté [[nom:labo]], les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : [[le:pt:pl:court]] sont [[acc:pt:regroupé:regroupée:pl]] sous les trois catégories citées plus haut. Une catégorie n'apparaît que si elle contient au moins [[un:produit]].
- **Dans les filtres** : le filtre « Catégorie » des historiques [[de:appro:pl]] (côté [[nom:activite]] comme côté [[nom:labo]]) et de l'historique [[un:perte:pl]] [[du:labo]] propose **trois options dédiées** — [[Nom:cat_pt_utilisable]], [[Nom:cat_pt_vendable]], [[Nom:cat_pt_valorise]] — en plus des catégories [[de:article:pl]]. En sélectionnant l'une d'elles, la liste « [[Nom:article]] » affiche [[le:pt:pl]] [[acc:pt:correspondant:correspondante:pl]].

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) et [[[Titre:produit_vendable:pl]]](#produits-vendables) — créer et gérer [[votre:pt:pl:court]]
- [[[Nom:produit_valorise:pl]]](#articles-valorises) — dont l'onglet « Composés »
- [La production d'[[un:pt:court]]](#calc-production-pt) et [[[Le:transfert:pl]]](#calc-transferts) — les calculs détaillés
- [[[Nom:stock]] [[Court:labo]]](#stock-labo), [[[Nom:transfert:pl]]](#transferts) et [Historiques](#historique) — les écrans concernés$m194_lexique_pt$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'lexique-pt'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '8a457588c479c882632f63deacdab00b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique-pt'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'lexique-pt'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Les 3 catégories [[de:pt:pl:court]]' WHERE slug = 'lexique-pt' AND titre = 'Les 3 catégories de PT';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique-pt' AND titre = 'Les 3 catégories [[de:pt:pl:court]]') THEN titres_gardes := titres_gardes || 'lexique-pt'::TEXT; END IF;
  -- ── onboarding-avenants ──
  t := $m194_onboarding_avenants$## 📑 Avenants & résiliation

Votre abonnement évolue avec votre entreprise : vous pouvez à tout moment demander [[un:activite:pl]], [[nom:labo:pl]] ou [[nom:gerant:pl]] supplémentaires — ou activer l'option [[Court:acheteur:pl]] et changer de palier — depuis la page **Demandes** du menu. Chaque ajout de capacité donne lieu à un avenant au contrat, signé électroniquement.

### Ce que vous voyez

- le bouton **+ Nouvelle demande** en haut de la page ;
- la liste de vos demandes avec leur statut — **En attente**, **Validée** ou **Refusée** — filtrable par statut et par période ;
- pour une demande d'ajout de capacité : un encart indiquant que le contrat avenant a été envoyé à votre adresse email, son état (en attente de signature ou signé), puis un bouton pour télécharger le contrat avenant signé.

### Demander de la capacité supplémentaire

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Ajout de capacité**.
2. Le formulaire rappelle votre configuration actuelle et affiche le prix de chaque supplément en DT, par unité et par mois ([[nom:activite]], [[nom:labo]], [[nom:gerant]]), promotions éventuelles comprises.
3. Réglez les compteurs + / − et, si vous le souhaitez, choisissez un **palier de l'option [[Court:acheteur:pl]]** (activation ou passage à un palier supérieur — le prix du palier s'affiche) ; le bloc « Nouveau total estimé » calcule en direct votre future mensualité en DT.
4. Cliquez sur **Envoyer la demande** : votre avenant est généré et un email de signature vous est envoyé immédiatement.
5. Ouvrez l'email « Signature de votre avenant d'abonnement » et cliquez sur **Consulter et signer mon avenant**.
6. Dès la signature, la capacité supplémentaire est **appliquée automatiquement** à votre compte : la demande passe en « Validée », vous recevez une notification et pouvez utiliser vos [[nouveau:activite:pl]], [[nom:labo:pl]], [[nom:gerant:pl]] — et, le cas échéant, votre nouveau palier [[nom:acheteur:pl]] — sans autre démarche.
7. Le contrat avenant signé reste ensuite téléchargeable depuis la demande concernée.

### Résiliation

À la clôture de votre abonnement, vous recevez par email un **acte de résiliation** à signer électroniquement (bouton « Consulter et signer l'acte »). Ce document formalise la fin de votre abonnement ; la signature se fait entièrement en ligne, comme pour le contrat initial.

### Points d'attention

:::attention
Tant que l'avenant n'est pas signé, la demande reste « En attente » et la capacité n'est pas ajoutée. Une demande en attente peut être supprimée si vous changez d'avis (bouton « Supprimer »).
:::

:::regle
Le palier [[nom:acheteur:pl]] demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option nécessite au moins [[un:labo]] — [[acc:labo:existant:existante]] ou [[acc:labo:ajouté:ajoutée]] dans la même demande.
:::

:::astuce
Le total estimé tient compte des promotions actives : le prix de base apparaît barré et le prix remisé s'affiche à côté. C'est ce montant qui figure sur l'avenant.
:::

### Voir aussi

- [[[Mon:activite:pl]]](#activites) · [[[Nom:gerant:pl]]](#gerants)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Mon abonnement](#abonnement) · [Historique des paiements](#historique-paiements)
- [Support & demandes](#support)$m194_onboarding_avenants$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-avenants'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '09e83ac1b8c1832001176cf77d9b8679';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-avenants'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-avenants'::TEXT;
  END IF;
  -- ── onboarding-configuration ──
  t := $m194_onboarding_configuration$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **[[Mon:activite:pl]]** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez [[votre:activite]] » rappelant ce que votre abonnement inclut (nombre [[de:activite:pl]] et [[de:labo:pl]]), avec le bouton **✨ Créer mon business** si votre abonnement inclut [[un:labo]], ou **+ Ajouter [[mon:activite]]** sinon — pour un **compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]), la carte devient « Démarrez [[votre:labo]] » avec le bouton **🏭 Créer [[mon:labo]]** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 [[nom:activite:pl]]) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez [[votre:labo]] et [[votre:activite:pl]].** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord [[det:labo_long:le]]**[[Nom:labo_long]]** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis [[det:activite:votre:pl]]**[[Nom:activite:pl]]** (nom, adresse et, si vous créez [[un:labo]], le choix « Avec [[nom:labo]] » ou « Sans [[nom:labo]] » pour [[acc:activite:chacun:chacune]]). Ajoutez autant [[de:activite:pl]] que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez [[votre:referentiel]].** Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]], [[le:referentiel:Nom]] se déverrouille dans le menu : créez vos unités, familles et catégories, puis [[votre:article:pl]] (nom, unité, catégorie).
3. **Affectez [[votre:article:pl]].** Sélectionnez, pour chaque [[nom:activite]] et pour [[le:labo]], [[le:article:pl]] qui y sont [[acc:article:utilisé:utilisée:pl]]. Les espaces [[Pl:activite]] et [[Court:labo]] se déverrouillent dès qu'[[un:article]] leur est [[acc:article:affecté:affectée]] ; l'Espace [[Nom:produit:pl]] s'ouvre dès [[acc:article:votre premier:votre première]] [[nom:article]] [[acc:article:créé:créée]].
4. **Saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].** Rendez-vous dans [[le:stock]] pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de [[votre:stock]] commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de [[votre:activite:pl]] et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]) : l'assistant se résume à la création [[du:labo]]. Constituez ensuite [[le:referentiel]], affectez [[votre:article:pl]] [[au:labo]], puis configurez [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module) : [[nom:article:pl]] commandables, carnet [[de:acheteur:pl]] et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles ([[nom:activite:pl]] [[acc:activite:créé:créée:pl]], [[nom:article:pl]] [[acc:article:affecté:affectée:pl]]) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$m194_onboarding_configuration$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-configuration'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '0b5f9bbb8c4ca98a6cce1012fbb5258a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-configuration'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-configuration'::TEXT;
  END IF;
  -- ── onboarding-contrat ──
  t := $m194_onboarding_contrat$## ✍️ Création du compte & signature du contrat

Votre parcours LabFlow commence avant même votre première connexion : l'administrateur crée votre compte, puis vous signez votre contrat d'abonnement entièrement en ligne, depuis un simple email.

### Comment se déroule cette étape

1. **Création du compte.** L'administrateur LabFlow enregistre vos informations (nom, email, téléphone, adresse) ainsi que la configuration de votre abonnement : nombre [[de:activite:pl]], [[de:labo:pl]] et [[de:gerant:pl]] inclus, frais d'activation et mensualité en DT, promotions éventuelles.
2. **Réception de l'email de signature.** Vous recevez un email intitulé « Signature de votre contrat d'abonnement », contenant le bouton **Consulter et signer mon contrat**.
3. **Signature en ligne.** Le lien ouvre votre contrat sur une plateforme de signature électronique sécurisée. Le document est déjà **pré-rempli** avec vos informations : identité, configuration et montants en DT. Vous n'avez qu'à le lire puis le signer directement en ligne — aucune impression ni scan n'est nécessaire.
4. **Suite automatique.** Dès que votre signature est enregistrée, l'email d'activation de votre compte vous est envoyé automatiquement (voir [Activation de votre compte](#onboarding-activation)).

### Ce que contient le contrat

- vos coordonnées ;
- la configuration de votre abonnement ([[nom:activite:pl]], [[nom:labo:pl]], [[nom:gerant:pl]]) ;
- les frais d'activation et la mensualité, exprimés en DT ;
- le cas échéant, le détail des promotions : montant remisé, durée, et date de reprise du tarif de base.

### Si l'email n'arrive pas

1. Vérifiez votre dossier **courrier indésirable (spam)** : les emails de signature y sont parfois classés.
2. L'email contient aussi le **lien direct** en toutes lettres, sous le bouton : vous pouvez le copier-coller dans votre navigateur.
3. Sinon, contactez l'administration LabFlow, qui vérifiera votre dossier et relancera l'envoi si nécessaire.

:::attention
Tant que le contrat n'est pas signé, votre compte ne peut pas être activé : l'email d'activation n'est envoyé qu'après la signature.
:::

:::astuce
Une fois votre compte activé, vous pourrez retélécharger votre contrat signé à tout moment depuis la page « Mon abonnement » (bouton « Contrat actif »).
:::

### Voir aussi

- [Activation de votre compte](#onboarding-activation)
- [Suivi de votre mise en route](#onboarding-suivi)
- [Mon abonnement](#abonnement)$m194_onboarding_contrat$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-contrat'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'de8c858652b8001e7a0dcdd1cb7c1b8f';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-contrat'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-contrat'::TEXT;
  END IF;
  -- ── onboarding-suivi ──
  t := $m194_onboarding_suivi$## 🚀 Suivi de votre mise en route

Bienvenue sur LabFlow ! Cette page vous accompagne pendant vos premiers pas : la liste de contrôle affichée au-dessus de ce texte reflète votre progression **d'après vos données réelles**. Chaque étape se coche automatiquement dès qu'elle est accomplie — vous n'avez rien à valider vous-même.

Votre mise en route se déroule en quatre temps, chacun détaillé dans une fiche dédiée :

1. [Création du compte & signature du contrat](#onboarding-contrat) — votre compte est créé par notre équipe et vous signez votre contrat d'abonnement entièrement en ligne.
2. [Activation de votre compte](#onboarding-activation) — vous définissez votre mot de passe grâce au lien reçu par email, puis vous vous connectez pour la première fois.
3. [Configuration initiale](#onboarding-configuration) — vous créez vos unités — [[nom:activite:pl]] et [[nom:labo:pl]], ou les types propres à votre domaine : la liste de contrôle affiche l'avancement par type, par exemple « 1/2 Restaurant · 0/1 Cuisine » —, constituez [[votre:referentiel]] [[de:article:pl]] et saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].
4. [Avenants & résiliation](#onboarding-avenants) — pour faire évoluer votre abonnement par la suite ([[nom:activite:pl]], [[nom:labo:pl]] ou [[nom:gerant:pl]] supplémentaires).

:::astuce
Revenez sur cette page à tout moment : chaque étape est cliquable et vous conduit à l'écran concerné ; la liste vous indique toujours la prochaine action à réaliser et se met à jour à chaque visite au fil de votre avancement.
:::

### Voir aussi

- [Démarrage](#demarrage)
- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)$m194_onboarding_suivi$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-suivi'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4d0cbaaa2e3ac53df592c86f1ebdb567';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-suivi'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-suivi'::TEXT;
  END IF;
  -- ── pertes ──
  t := $m194_pertes$## 📉 [[Nom:perte:pl]]

Déclarez [[le:produit:pl]] [[acc:produit:perdu:perdue:pl]] — casse, péremption, chutes de production — pour que [[le:stock]] et vos coûts reflètent la réalité. La **saisie** se fait directement depuis [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) (bouton **📉 [[Court:perte]]** sur la ligne [[du:article]]) ; la **consultation** dans l'écran **Historique [[Court:perte:pl]]** du menu [[Nom:espace_activites]].

### Les types [[de:perte]]

| Type | Usage |
|---|---|
| **Avarie** | [[nom:produit]] [[acc:produit:abîmé:abîmée]], [[acc:produit:périmé:périmée]], impropre [[au:vente]] |
| **Déchet** | [[nom:perte:pl]] de production, parures, casse (domaine Restauration) |

Un autre domaine d'activité peut définir ses propres types [[de:perte]] (par exemple *casse* ou *rebut*) : ce sont alors ceux-là qui apparaissent dans la fenêtre de saisie, les filtres et les badges.

### Actions pas à pas

1. Dans **[[Nom:stock]] [[Court:activite:pl]]**, sélectionnez [[le:activite]] puis cliquez sur **📉 [[Court:perte]]** sur la ligne [[du:article]].
2. La fenêtre affiche [[det:stock:le]]**[[nom:stock]] disponible**. Saisissez la **quantité perdue** — elle ne peut pas dépasser [[ce:stock]] (un avertissement s'affiche sinon).
3. Choisissez le **type** (Avarie ou Déchet par défaut — selon votre domaine) et la **date [[du:perte]]** : elle doit se situer entre [[acc:appro:le premier:la première]] [[nom:appro]] [[du:article]] ([[acc:appro:rappelé:rappelée]] sous le champ) et aujourd'hui.
4. Le **prix unitaire** d'achat en vigueur à la date choisie est récupéré automatiquement, et le **coût total** [[du:perte]] s'affiche aussitôt.
5. Cliquez sur **Enregistrer [[le:perte]]** : [[le:stock]] diminue et [[le:perte]] est [[acc:perte:tracé:tracée]].

:::formule Valeur d'[[un:perte]]
Valeur = Quantité perdue × Prix unitaire d'achat à la date [[du:perte]]
note: L'écran [[Nom:perte:pl]] affiche le prix d'achat HT ; dans les rapports et tableaux de bord, [[le:perte:pl]] sont [[acc:perte:valorisé:valorisée:pl]] en TTC.
:::

### Où retrouver [[votre:perte:pl]]

- **Historique [[Court:perte:pl]]** : consultation **[[nom:activite]] par [[nom:activite]]** (pastilles 🏪), filtres **Du / Au**, **Catégorie**, **[[Nom:article]]** et **Type** (les types de votre domaine), bouton **Rechercher**. Le tableau affiche [[Nom:activite]], [[Nom:article]], Date, Type (badge coloré), Quantité, Prix Unit., Coût Total et Par (auteur de la saisie), avec les totaux **quantité** et **coût** affichés au-dessus et en pied de tableau. Export **Excel**, avec surbrillance des lignes cochées.
- Dans **[[Nom:stock]] [[Court:activite:pl]]** : la ligne **↘ [[court:perte:pl]]** de la colonne [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] cumule les quantités perdues ; pour [[un:pt]], le lien 📋 Historique marque en plus chaque [[nom:perte]] d'un badge 🗑️.

Depuis l'historique, **✏️ Modifier** permet de corriger la quantité et le type — la date et le prix restent verrouillés, et un avertissement rappelle que changer la quantité impacte le calcul [[du:stock]] [[acc:stock:actuel:actuelle]]. **🗑️ Supprimer** recalcule [[le:stock]] ; l'action est **irréversible**. [[Un:gerant]] ne peut modifier ou supprimer que ses propres saisies.

### Points d'attention

:::attention
Impossible de déclarer [[un:perte]] sur [[un:article]] jamais [[acc:article:approvisionné:approvisionnée]] : l'application demande d'enregistrer d'abord [[un:appro:court]]. Pour [[un:pt]], il n'y a pas de prix d'achat : aucun coût ne s'affiche à la saisie, mais [[le:perte]] est [[acc:perte:valorisé:valorisée]] au coût [[de:recette]] [[du:produit]] (quand il est calculable) dans l'historique et les rapports.
:::

:::astuce
Saisissez [[le:perte:pl]] au fil de l'eau plutôt qu'en fin de mois : [[votre:stock]] reste juste, et [[det:inventaire:le]][[[nom:inventaire]]](#inventaire) ne sert plus qu'à confirmer. Un écart [[de:inventaire]] négatif récurrent signale [[un:perte:pl]] non [[acc:perte:déclaré:déclarée:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:inventaire]]](#inventaire) · [Historiques](#historique)
- [Valeur [[du:stock]]](#calc-valeur-stock) · [HT et TTC](#calc-ht-ttc)$m194_pertes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'pertes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '3a2ea75db3b37c9d439f2397e51a73f9';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'pertes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'pertes'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:perte:pl]]' WHERE slug = 'pertes' AND titre = 'Pertes';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'pertes' AND titre = '[[Nom:perte:pl]]') THEN titres_gardes := titres_gardes || 'pertes'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'pertes' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'pertes' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'pertes'::TEXT; END IF;
  -- ── produits-utilisables ──
  t := $m194_produits_utilisables$## 🧪 [[Titre:produit_utilisable:pl]] ([[nom:pt:pl]])

[[Det:produit_utilisable:un]]**[[nom:produit_utilisable]]** ([[court:produit_utilisable]]) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n'est pas vendue telle quelle mais **réutilisée dans d'autres [[nom:recette:pl]]**. Vous [[acc:produit_utilisable:le:la]] trouvez dans le menu **Espace [[Pl:produit]] → [[Titre:produit_utilisable:pl]]**. Chaque [[court:produit_utilisable]] possède [[acc:recette:son propre:sa propre]] [[nom:recette]] et peut être [[acc:produit_utilisable:produit:produite]], [[acc:produit_utilisable:stocké:stockée]] et [[acc:produit_utilisable:transféré:transférée]].

### Ce que vous voyez

- Une barre de filtres : **📍 [[Nom:activite]]**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ [[Nom:produit_utilisable]]**.
- Des **cartes [[nom:produit]]** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N [[nom:article:pl]] · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : [[det:activite:le:pl]]**[[Pl:activite]]** et [[det:labo:le:pl]]**[[Pl:labo]]** où [[le:produit]] est [[acc:produit:géré:gérée]].
- Un badge **⇄ [[Nom:transfert]] uniquement** sur [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]] : [[acc:produit:il:elle:pl]] ne peuvent être [[acc:produit:approvisionné:approvisionnée:pl]] en [[nom:activite]] que par [[nom:transfert]].

### Les deux modes [[de:appro]]

À la première étape de l'assistant, vous choisissez le circuit [[du:produit]] :

| Mode | Fonctionnement |
|---|---|
| 🆓 [[Court:appro:pl]] libres | [[Le:produit]] est [[acc:produit:géré:gérée]] directement dans [[le:activite:pl]] : [[nom:appro:pl]] [[acc:appro:manuel:manuelle:pl]] possibles. À l'ouverture, **[[tous:activite:les]] et [[tous:labo:les]] sont pré-cochés** — décochez pour exclure. |
| 🔒 [[Court:appro:pl]] [[acc:appro:limité:limitée:pl]] [[au:transfert:pl]] | [[Le:produit]] est **[[acc:produit:fabriqué:fabriquée]] [[acc:labo:au(x):à la/aux]] [[nomS:labo]] [[acc:labo:choisi(s):choisie(s)]]**. [[Le:activite:pl]] [[acc:activite:rattaché:rattachée:pl]] à [[ce:labo:pl]] sont [[acc:activite:pré-coché:pré-cochée:pl]] et [[acc:produit:le:la]] recevront **uniquement par [[nom:transfert]]** ; [[aucun:appro:court]] [[acc:appro:manuel:manuelle]] en [[nom:activite]]. |

En mode limité, si [[aucun:activite]] n'est [[acc:activite:coché:cochée]], [[le:produit]] reste [[au:labo]] (non [[acc:produit:distribué:distribuée]]). [[Le:article:pl]] [[acc:article:proposé:proposée:pl]] pour [[le:recette]] correspondent toujours au périmètre choisi.

### Actions pas à pas

**Créer [[un:produit_utilisable]]**

1. Cliquez sur **+ [[Nom:produit_utilisable]]** : le même assistant en 5 étapes que pour les vendables s'ouvre (Affectation, Identité, [[Pl:article]], [[Titre:produit_utilisable:pl]], Récap).
2. À l'étape Affectation, choisissez le mode [[de:appro]] (voir tableau ci-dessus).
3. À l'étape Identité, saisissez le nom et la référence éventuelle — **aucune catégorie n'est demandée** pour [[un:produit_utilisable:court]].
4. Composez [[le:recette]] : [[nom:article:pl]] avec [[nom:portion:pl]], et éventuellement d'autres [[nom:produit_utilisable:pl]] comme sous-composants (au moins 2 composants au total).
5. Vérifiez le récapitulatif puis validez.

**Ajuster les affectations** : cliquez sur les pastilles **[[Pl:activite]]** ou **[[Pl:labo]]** sous la carte pour activer ou retirer [[le:produit]] en un clic.

### À quoi servent-[[acc:produit_utilisable:ils:elles]] dans [[le:recette:pl]]

[[Un:produit_utilisable:court]] s'ajoute comme **sous-composant** d'[[un:produit_vendable]], d'un composé valorisé ou d'[[acc:produit_utilisable:un autre:une autre]] [[court:produit_utilisable]]. Son coût se répercute automatiquement partout où [[acc:produit_utilisable:il:elle]] est [[acc:produit_utilisable:utilisé:utilisée]].

:::formule Coût unitaire d'[[un:produit_utilisable]]
Coût = Σ ( [[nom:portion]] [[nom:article]] × prix unitaire ) + Σ ( [[nom:portion]] sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de [[son:recette]].
:::

### Points d'attention

:::attention
La suppression d'[[un:produit_utilisable:court]] ayant un historique déclenche une **suppression en cascade** : la fenêtre de confirmation détaille le nombre [[de:appro:pl]] [[acc:appro:supprimé:supprimée:pl]], ainsi que [[le:stock]], [[le:inventaire:pl]] et [[le:perte:pl]] concernés. L'action est irréversible.
:::

:::regle
[[Un:produit_utilisable:court]] d'origine [[nom:labo]] ne peut **jamais** être [[acc:produit_utilisable:approvisionné:approvisionnée]] manuellement dans [[un:activite]] : [[le:stock]] [[du:activite:pl]] n'évolue que par [[[nom:transfert]]](#transferts).
:::

:::astuce
Mutualisez vos préparations : une sauce définie une seule fois alimente [[tous:recette:les]] qui l'utilisent, et toute mise à jour se propage automatiquement.
:::

### Voir aussi

- [Lexique [[du:pt:pl]]](#lexique-pt)
- [[[Titre:produit_vendable:pl]]](#produits-vendables) — pour intégrer [[votre:produit_utilisable:pl:court]] [[au:recette:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[court:labo]]](#stock-labo)
- [Production d'[[un:pt]]](#calc-production-pt)
- [[[Nom:transfert:pl]] [[compl:labo]] → [[nom:activite:pl]]](#calc-transferts)$m194_produits_utilisables$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'produits-utilisables'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'c90a12ceecd96cdbfc0b772fd58cf09c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-utilisables'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'produits-utilisables'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Titre:produit_utilisable:pl]]' WHERE slug = 'produits-utilisables' AND titre = 'Produits Utilisables';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-utilisables' AND titre = '[[Titre:produit_utilisable:pl]]') THEN titres_gardes := titres_gardes || 'produits-utilisables'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_produits]]' WHERE slug = 'produits-utilisables' AND partie = 'Espace Produit';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-utilisables' AND partie = '[[Nom:espace_produits]]') THEN parties_gardees := parties_gardees || 'produits-utilisables'::TEXT; END IF;
  -- ── produits-vendables ──
  t := $m194_produits_vendables$## 🍽️ [[Titre:produit_vendable:pl]] & [[Nom:supplement:pl]]

Cet écran regroupe [[det:produit:votre:pl]]**[[nom:produit:pl]] [[acc:produit:fini:finie:pl]] [[acc:produit:destiné:destinée:pl]] [[au:vente]]** (plats, pizzas, formules…) et [[det:supplement:votre:pl]]**[[nom:supplement:pl]]** (sauce, garniture vendue en plus). Vous le trouvez dans le menu **Espace [[Pl:produit]] → [[Titre:produit_vendable:pl]]**. Chaque [[nom:produit]] est [[acc:produit:défini:définie]] par [[son:recette]], qui sert au calcul de son coût de revient.

### Ce que vous voyez

- Deux onglets avec compteurs : **🍽️ [[Pl:produit_vendable]]** et **➕ [[Pl:supplement]] vendables**.
- Une barre de filtres : **📍 [[Nom:activite]]**, **🏷️ Catégorie**, **🔍 Nom**, bouton **Réinitialiser**, bouton **Exporter XLS** et bouton **+ [[Nom:produit_vendable]]** (ou **+ [[Nom:supplement]] vendable** selon l'onglet).
- Des **cartes [[nom:produit]]** (9 par page, avec pagination) affichant : le nom, la référence éventuelle, le badge de catégorie, le bouton **👁 Voir composition** (avec un résumé du type « 2 [[nom:article:pl]] · 1 [[court:produit_utilisable]] »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et des **pastilles [[de:activite:pl]]** en bas de carte.

### L'assistant unique de création et de modification

Un **même assistant en 5 étapes** sert à créer ET à modifier [[un:produit]] (le bouton **Modifier** l'ouvre pré-rempli) :

1. **Affectation** — cochez [[acc:activite:le:la]] ou [[det:activite:le:pl]]**[[nom:activite:pl]]** qui vendront [[ce:produit]] (bouton « Tout sélectionner » disponible).
2. **Identité** — saisissez le **nom** (obligatoire), une **référence** (optionnelle) et la **catégorie [[de:produit]]** (obligatoire, du bon type). Pour [[un:produit_vendable]] (hors [[nom:supplement]]), une option **📦 « Gérer [[ce:produit]] en [[nom:stock]] ([[court:appro:pl]] libres) »** permet de [[acc:produit_vendable:le:la]] suivre dans [[le:stock]] [[du:activite:pl]] [[acc:activite:choisi:choisie:pl]] : [[nom:appro:pl]] [[acc:appro:manuel:manuelle:pl]], [[nom:transfert:pl]], [[nom:perte:pl]], seuil et [[nom:inventaire]]. Vous pouvez alors aussi cocher [[det:labo:le:pl]]**[[nom:labo:pl]]** où [[acc:produit_vendable:il:elle]] sera [[acc:produit_vendable:géré:gérée]].
3. **[[Pl:article]]** — recherchez [[votre:article_ingredient:pl]] (filtres par famille et catégorie [[de:article]]), cochez-les et saisissez [[det:portion:le]]**[[nom:portion]]** dans l'unité [[du:article]]. Seules les lignes avec [[un:portion]] [[acc:portion:supérieur:supérieure]] à 0 sont retenues.
4. **[[Titre:produit_utilisable:pl]]** — ajoutez d'éventuelles sous-préparations (avec leur [[nom:portion]]). [[Le:recette]] doit compter **au moins 2 composants** au total ; [[det:supplement:un]]**[[nom:supplement]]** en compte **exactement 1** ([[un:article]] OU [[un:produit_utilisable]]).
5. **Récap** — vérifiez l'identité, les composants et les affectations, puis validez avec **Créer [[le:produit]] ✓**. Un écran de confirmation propose **+ Ajouter un autre**.

### Actions pas à pas

**Consulter [[un:recette]]** : cliquez sur **👁 Voir composition** — l'arborescence affiche [[le:article:pl]] avec leurs [[nom:portion:pl]] et les sous-préparations, dépliables niveau par niveau.

**Affecter à [[un:activite]]** : cliquez sur une **pastille [[de:activite]]** sous la carte ; la coche ✓ indique que [[le:produit]] y est disponible.

**Exporter** : le bouton **Exporter XLS** génère la liste filtrée ; pour les vendables, une option permet d'inclure aussi l'autre onglet ([[nom:supplement:pl]] ou [[nom:produit:pl]]) dans une feuille séparée du même fichier.

**Supprimer** : bouton **Supprimer**, puis confirmation. L'action est **irréversible**.

### Points d'attention

:::regle
Le **prix de vente ne se définit pas ici** : il se configure par [[nom:activite]] dans la [Configuration [[Court:vente]]](#configuration-vente).
:::

:::attention
En tant que **[[nom:gerant]]**, vous consultez cet écran mais la création, la modification et la suppression [[du:produit:pl]] sont réservées au compte propriétaire.
:::

:::astuce
Servez-vous des filtres [[Nom:activite]] et Catégorie pour vérifier rapidement qu'[[aucun:produit]] de la carte d'[[un:activite_desc]] n'a été [[acc:produit:oublié:oubliée]].
:::

### Voir aussi

- [Catégories [[Court:produit:pl]]](#categories-produits) — à créer avant [[votre:produit:pl]]
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) — les sous-préparations de [[votre:recette:pl]]
- [[[Titre:fiche_technique:pl]]](#fiches-techniques) — coût de revient et export
- [Comprendre le coût d'[[un:recette]]](#calc-cout-recette)
- [Configuration [[Court:vente]]](#configuration-vente)$m194_produits_vendables$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'produits-vendables'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '6519d79513c5270098ae9bdd16787abc';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-vendables'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'produits-vendables'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Titre:produit_vendable:pl]]' WHERE slug = 'produits-vendables' AND titre = 'Produits Vendables';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-vendables' AND titre = '[[Titre:produit_vendable:pl]]') THEN titres_gardes := titres_gardes || 'produits-vendables'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_produits]]' WHERE slug = 'produits-vendables' AND partie = 'Espace Produit';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-vendables' AND partie = '[[Nom:espace_produits]]') THEN parties_gardees := parties_gardees || 'produits-vendables'::TEXT; END IF;
  -- ── rapports ──
  t := $m194_rapports$## 📈 Les rapports ont rejoint le Tableau de bord

Les anciennes pages « Rapports » ont été intégrées au [Tableau de bord](#dashboard), plus complet et entièrement filtrable :

- Le **rapport d'activités** ([[nom:stock]], achats, [[nom:perte:pl]], alertes de seuil) correspond à l'onglet **Achats & [[nom:stock]]**, complété par l'onglet **[[Nom:perte:pl]]**.
- Chaque onglet dispose d'un **export Excel** reprenant les données filtrées.

:::astuce
Vos anciens liens continuent de fonctionner : ils ouvrent automatiquement le bon onglet du tableau de bord.
:::$m194_rapports$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'rapports'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'a304f13e652c9affba008757ede91e0e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'rapports'::TEXT;
  END IF;
  -- ── rapports-labo ──
  t := $m194_rapports_labo$## 🧪 Le rapport [[compl:labo]] a rejoint le Tableau de bord

Le suivi [[du:labo]] se fait désormais dans l'onglet **[[Court:labo]]** du [Tableau de bord](#dashboard) : valeur [[du:stock]], achats, **production [[de:pt:pl]]**, [[nom:transfert:pl]] [[acc:transfert:émis:émise:pl]] par [[nom:activite]] destinataire, [[nom:perte:pl]] et [[nom:vente:pl]] [[du:labo]] — avec la période et [[le:labo:pl]] de votre choix, et un export Excel.$m194_rapports_labo$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'rapports-labo'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '6e7af0a6e6c8f9e18f2a4891d61230f6';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-labo'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'rapports-labo'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Rapport [[compl:labo]] (intégré au tableau de bord)' WHERE slug = 'rapports-labo' AND titre = 'Rapport labo (intégré au tableau de bord)';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-labo' AND titre = 'Rapport [[compl:labo]] (intégré au tableau de bord)') THEN titres_gardes := titres_gardes || 'rapports-labo'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'rapports-labo' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-labo' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'rapports-labo'::TEXT; END IF;
  -- ── rapports-vente ──
  t := $m194_rapports_vente$## 💰 Le rapport [[de:vente:pl]] a rejoint le Tableau de bord

L'analyse [[du:vente:pl]] se fait désormais dans l'onglet **[[Nom:vente:pl]] & [[nom:marge:pl]]** du [Tableau de bord](#dashboard), en mieux :

- [[nom:marge:pl]] par **canal** ([[nom:vente]] [[acc:vente:direct:directe]], chaque [[nom:prestataire]]) avec les **commissions déduites** ;
- [[nom:marge:pl]] par **catégorie [[de:produit:pl]]** et par **type** ([[nom:produit:pl]], [[nom:supplement:pl]], valorisés) ;
- **cascade** du CA [[au:marge]] [[acc:marge:net estimé:nette estimée]] (commissions et charges fixes comprises) ;
- détail par [[nom:produit]] triable (CA, [[nom:marge]], [[nom:food_cost]], part du CA) et export Excel.

Filtrez par [[nom:activite:pl]], types de vente, [[nom:prestataire:pl]] et catégories — en multi-sélection.$m194_rapports_vente$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'rapports-vente'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '31981ac6267d52b2807260be55baa2d9';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-vente'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'rapports-vente'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Rapport [[de:vente:pl]] (intégré au tableau de bord)' WHERE slug = 'rapports-vente' AND titre = 'Rapport de ventes (intégré au tableau de bord)';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-vente' AND titre = 'Rapport [[de:vente:pl]] (intégré au tableau de bord)') THEN titres_gardes := titres_gardes || 'rapports-vente'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_vente]]' WHERE slug = 'rapports-vente' AND partie = 'Espace Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'rapports-vente' AND partie = '[[Nom:espace_vente]]') THEN parties_gardees := parties_gardees || 'rapports-vente'::TEXT; END IF;
  -- ── referentiel-articles ──
  t := $m194_referentiel_articles$## 🧂 [[Nom:article:pl]]

[[Le:article:pl]] sont vos matières premières et [[nom:ingredient:pl]] : c'est le cœur [[du:referentiel]], utilisé pour [[le:stock]], [[le:appro:pl]] et [[le:fiche_technique:pl]]. Vous les gérez depuis le menu **[[Nom:referentiel]] → [[Nom:article:pl]]**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total [[de:article:pl]]**.
- Une barre de filtres : champ **Recherche**, liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 [[nom:article:pl]] sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d'action : **+ Ajout multiple** et **+ [[Nouveau:article]]**.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d'un clic sur la flèche ▶ et affiche son nombre [[de:article:pl]] ([[le:article:pl]] non [[acc:article:classé:classée:pl]] apparaissent sous « Sans catégorie »). Chaque ligne [[de:article]] affiche son nom, un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Actions pas à pas

Créer [[un:article]] (assistant en deux étapes) :

1. Cliquez sur **+ [[Nouveau:article]]**.
2. Étape **Informations** : saisissez le **nom**, choisissez l'**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie). Si aucune catégorie n'existe, un message vous invite à en créer d'abord dans [[le:referentiel]]. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez [[le:activite:pl]] 📍 et/ou [[nom:labo:pl]] 🏭 où [[le:article]] sera [[acc:article:utilisé:utilisée]] — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d'un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer [[le:article]]**. Le bouton **← Retour** permet de revenir à l'étape 1.

Créer plusieurs [[nom:article:pl]] d'un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie**, puis cliquez sur **+ Affecter** pour cocher [[le:activite:pl]] 📍 et [[nom:labo:pl]] 🏭 de la ligne (le bouton affiche ensuite le nombre d'affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier [[un:article]] et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, l'unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur [[un:activite]] ou [[un:labo]] pour l'ajouter ou [[acc:labo:le:la]] retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer [[un:article]] :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. [[Le:stock:pl]] et historiques liés sont conservés.

### Points d'attention

:::attention
La corbeille est **grisée** si [[le:article]] a [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée.
:::

:::attention
[[Un:article]] non [[acc:article:affecté:affectée]] à [[un:activite]] ou [[un:labo]] n'y apparaît ni en [[nom:stock]], ni en [[nom:appro]], ni dans [[le:fiche_technique:pl]]. L'affectation est la clé qui rend [[le:article]] utilisable sur le terrain.
:::

:::astuce
Pour un gros volume [[de:article:pl]], préférez l'[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations depuis la fiche de chaque [[nom:article]].
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer [[votre:article:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — où [[votre:article:pl]] sont [[acc:article:utilisé:utilisée:pl]]$m194_referentiel_articles$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-articles'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'e5ae49c419a0a1a48c571c2c0625ca80';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-articles'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:article:pl]]' WHERE slug = 'referentiel-articles' AND titre = 'Articles';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles' AND titre = '[[Nom:article:pl]]') THEN titres_gardes := titres_gardes || 'referentiel-articles'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:referentiel]]' WHERE slug = 'referentiel-articles' AND partie = 'Référentiel';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles' AND partie = '[[Nom:referentiel]]') THEN parties_gardees := parties_gardees || 'referentiel-articles'::TEXT; END IF;
  -- ── referentiel-categories ──
  t := $m194_referentiel_categories$## 🏷️ Catégories

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer [[votre:article:pl]] dans tout LabFlow. Vous les gérez depuis le menu **[[Nom:referentiel]] → Catégories**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de catégories**.
- Une barre de filtres : champ **Recherche**, liste déroulante **Famille** (« Toutes les familles ») pour n'afficher que les catégories d'une famille, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle catégorie**.
- Un tableau à trois colonnes : **Nom**, **Famille** (nom de la famille de rattachement, ou — si la catégorie n'en a pas) et **Actions** (✏️ Modifier, corbeille 🗑️).

### Actions pas à pas

Créer une ou plusieurs catégories :

1. Cliquez sur **+ Nouvelle catégorie**.
2. Sur chaque ligne, saisissez le **nom** (ex. Viandes) et choisissez la **famille** de rattachement dans la liste déroulante — la famille est obligatoire dès lors que des familles existent.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d'un coup, puis sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton indique le nombre de catégories à créer.

Modifier ou reclasser une catégorie :

1. Cliquez sur **✏️ Modifier**.
2. Corrigez le nom et/ou changez la famille de rattachement, puis **Enregistrer**.

Supprimer une catégorie :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. [[Le:article:pl]] [[acc:article:rattaché:rattachée:pl]] perdront leur catégorie et apparaîtront en « Sans catégorie » dans l'écran [[[Nom:article:pl]]](#referentiel-articles).

### Points d'attention

:::attention
La corbeille est **grisée** lorsque [[un:article:pl]] de la catégorie ont [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée pour protéger vos historiques.
:::

:::attention
Ne confondez pas les **catégories [[de:article:pl]]** ([[ce:referentiel]], pour vos matières premières) avec les [catégories [[de:produit:pl]]](#categories-produits) [[du:espace_produits:Nom]], qui classent [[votre:produit:pl]] pour [[le:vente]].
:::

:::astuce
Créez d'abord vos [familles](#referentiel-familles) : le formulaire de création exige une famille pour chaque catégorie. Une arborescence claire (famille → catégorie) rend ensuite les filtres et les regroupements beaucoup plus efficaces dans tous les écrans.
:::

### Voir aussi

- [Familles](#referentiel-familles) — le niveau supérieur [[du:referentiel]]
- [[[Nom:article:pl]]](#referentiel-articles) — chaque [[nom:article]] se classe dans une catégorie
- [Catégories [[de:produit:pl]]](#categories-produits) — à ne pas confondre
- [Lexique](#lexique)$m194_referentiel_categories$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-categories'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'd3370373d81aed79e7810661274d153b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-categories'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-categories'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:referentiel]]' WHERE slug = 'referentiel-categories' AND partie = 'Référentiel';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-categories' AND partie = '[[Nom:referentiel]]') THEN parties_gardees := parties_gardees || 'referentiel-categories'::TEXT; END IF;
  -- ── referentiel-familles ──
  t := $m194_referentiel_familles$## 🗂️ Familles

Les familles regroupent vos catégories [[de:article:pl]] (ex. « Viandes », « Épicerie », « Boissons ») et portent deux propriétés qui déterminent la nature de [[tous:article:les]] [[acc:article:rattaché:rattachée:pl]] : **Consommable** et **Vendable**. Vous les gérez depuis le menu **[[Nom:referentiel]] → Familles**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de familles**.
- Une barre de filtres : champ **Recherche**, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle famille**.
- Un tableau à quatre colonnes : **Nom**, **Consommable** (interrupteur Oui/Non), **Vendable** (interrupteur Oui/Non) et **Actions** (✏️ Modifier, corbeille 🗑️).

Les interrupteurs Consommable et Vendable sont **cliquables directement dans le tableau** : un clic bascule la propriété immédiatement, sans passer par une fenêtre de modification.

### Le rôle des deux propriétés

| Consommable | Vendable | Nature [[du:article:pl]] de la famille |
|---|---|---|
| Oui | Oui ou Non | [[Nom:ingredient]] : [[acc:ingredient:suivi:suivie]] en [[nom:stock]], utilisable dans [[le:fiche_technique:pl]] |
| Non | Oui | [[Nom:article]] [[acc:article:valorisé:valorisée]] : [[acc:article:vendu:vendue]] [[acc:article:tel quel:telle quelle]], sans [[nom:recette]] |

:::regle
[[Un:article]] ne devient « [[acc:article:valorisé:valorisée]] » que si sa famille est **Vendable = Oui** et **Consommable = Non**. Voir [Articles Valorisés](#articles-valorises).
:::

### Actions pas à pas

Créer une ou plusieurs familles :

1. Cliquez sur **+ Nouvelle famille**.
2. Saisissez le nom (ex. Produits laitiers) et réglez les interrupteurs **Consommable** et **Vendable** de la ligne — tous deux activés par défaut.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d'un coup (la touche Entrée sur la dernière ligne fonctionne aussi), puis sur **Enregistrer**.

Modifier une famille :

1. Cliquez sur **✏️ Modifier**, ajustez le nom et/ou les deux interrupteurs, puis **Enregistrer**.

Supprimer une famille :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les catégories rattachées perdront leur famille : pensez à les reclasser depuis l'écran [Catégories](#referentiel-categories).

### Points d'attention

:::attention
La corbeille est **grisée** lorsque [[un:article:pl]] de la famille ont [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée. Survolez le bouton pour afficher l'explication.
:::

:::attention
Basculer un interrupteur modifie la nature de **[[tous:article:les]]** [[acc:article:rattaché:rattachée:pl]] à la famille. Vérifiez l'impact avant de désactiver Consommable ou Vendable sur une famille déjà utilisée en [[nom:stock]] ou en [[nom:vente]].
:::

:::astuce
Définissez vos familles avant vos catégories et [[votre:article:pl]] : la hiérarchie [[du:referentiel]] va des familles vers les catégories, puis vers [[le:article:pl]].
:::

### Voir aussi

- [Catégories](#referentiel-categories) — chaque catégorie se rattache à une famille
- [Articles Valorisés](#articles-valorises) — issus des familles vendables non consommables
- [[[Nom:article:pl]]](#referentiel-articles)
- [Lexique](#lexique)$m194_referentiel_familles$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-familles'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '2e9f0223fbfd8b77412436fe03599be5';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-familles'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-familles'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:referentiel]]' WHERE slug = 'referentiel-familles' AND partie = 'Référentiel';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-familles' AND partie = '[[Nom:referentiel]]') THEN parties_gardees := parties_gardees || 'referentiel-familles'::TEXT; END IF;
  -- ── referentiel-import ──
  t := $m194_referentiel_import$## 📥 Ajout dynamique (import Excel)

L'Ajout Dynamique permet d'importer en masse [[votre:article:pl]] — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **[[Nom:referentiel]] → Ajout Dynamique**. C'est le moyen le plus rapide de constituer [[votre:referentiel]] au démarrage.

### Ce que vous voyez

L'écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **[[Nom:article]] / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s'affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l'import**.
- **Le bilan d'import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**[[Nom:article:pl]]**, **Auto-[[acc:article:affecté:affectée:pl]]**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / [[Nom:article]] / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par [[nom:article]]** : nom [[du:article]], unité, catégorie et famille. Les unités, catégories et familles qui n'existent pas encore dans [[votre:referentiel]] seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d'import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l'import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

[[Le:article:pl]] [[acc:article:importé:importée:pl]] sont **automatiquement [[acc:article:affecté:affectée:pl]]** à [[votre:activite:pl]] et [[nom:labo:pl]] : [[acc:article:il:elle:pl]] sont immédiatement utilisables en [[nom:stock]] et en [[nom:appro]]. Si [[un:article]] existait déjà mais n'était [[acc:article:affecté:affectée]] nulle part, [[acc:article:il:elle]] est [[acc:article:assigné:assignée]] automatiquement et [[acc:article:signalé:signalée]] par le badge **🔗 auto** dans la colonne Affectation.

### Points d'attention

:::attention
Respectez l'orthographe des unités, familles et catégories déjà présentes dans [[votre:referentiel]] : toute variante d'écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour [[le:article:pl]], unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.
:::

:::astuce
Après un import, ajustez finement [[acc:activite:quel:quelle:pl]] [[nom:activite:pl]] et [[acc:labo:quel:quelle:pl]] [[nom:labo:pl]] utilisent chaque [[nom:article]] depuis sa fiche ([[[Nom:article:pl]]](#referentiel-articles)).
:::

### Voir aussi

- [[[Nom:article:pl]]](#referentiel-articles) — création manuelle à l'unité ou en série
- [[[Nom:article:pl]]](#referentiel-articles) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)$m194_referentiel_import$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-import'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'cae6766446b2321ced954985c92b671f';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-import'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:referentiel]]' WHERE slug = 'referentiel-import' AND partie = 'Référentiel';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import' AND partie = '[[Nom:referentiel]]') THEN parties_gardees := parties_gardees || 'referentiel-import'::TEXT; END IF;
  -- ── referentiel-unites ──
  t := $m194_referentiel_unites$## 📏 Unités de mesure

Les unités de mesure constituent le premier niveau de [[votre:referentiel]] : elles définissent comment vous quantifiez [[votre:article:pl]] (kg, L, g, pièce, portion, boîte…). Vous les gérez depuis le menu **[[Nom:referentiel]] → Unités**. Une unité est **obligatoire** pour créer [[un:article]].

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total d'unités** de [[votre:referentiel]].
- Une barre de filtres avec un champ **Recherche** (le tableau se filtre au fur et à mesure de la saisie), le compteur de résultats et un bouton **Réinitialiser** dès qu'une recherche est active.
- Le bouton **+ Nouvelle unité** dans la barre de filtres.
- Un tableau à deux colonnes : **Nom** et **Actions** (bouton **✏️ Modifier** et corbeille 🗑️).

Si aucune unité n'existe encore, l'écran propose directement **+ Créer la première unité**.

### Actions pas à pas

Créer une ou plusieurs unités :

1. Cliquez sur **+ Nouvelle unité**.
2. Saisissez le nom de la première unité (ex. kg, L, pièce).
3. Cliquez sur **+ Ajouter une ligne** pour en saisir d'autres — la touche Entrée sur la dernière ligne ajoute aussi une nouvelle ligne. La croix en bout de ligne retire une ligne inutile.
4. Cliquez sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton affiche le nombre d'unités qui vont être créées.

Renommer une unité :

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Corrigez le nom puis cliquez sur **Enregistrer**. Le nouveau nom s'applique partout où l'unité est utilisée.

Supprimer une unité :

1. Cliquez sur la corbeille 🗑️ de la ligne, puis confirmez avec **Supprimer** dans la fenêtre de confirmation.
2. [[Le:article:pl]] encore [[acc:article:rattaché:rattachée:pl]] à cette unité perdront leur unité : pensez à leur en réaffecter une depuis l'écran [[[Nom:article:pl]]](#referentiel-articles).

### Points d'attention

:::attention
La corbeille est **grisée** lorsque l'unité est utilisée par [[un:article:pl]] ayant [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est alors bloquée pour protéger vos historiques et vos coûts. Survolez le bouton pour afficher l'explication.
:::

:::astuce
Restez cohérent : utilisez la même unité pour l'achat et pour [[le:recette]] d'[[acc:article:un même:une même]] [[nom:article]] (ex. tout en kg) afin que les coûts calculés restent justes. Créez dès le départ un petit jeu d'unités standard (kg, g, L, pièce, portion) plutôt que de multiplier les variantes proches.
:::

### Voir aussi

- [[[Nom:article:pl]]](#referentiel-articles) — l'unité est choisie à la création de chaque [[nom:article]]
- [Ajout dynamique](#referentiel-import) — les unités manquantes sont créées automatiquement à l'import
- [Lexique](#lexique)
- [Bien démarrer](#demarrage)$m194_referentiel_unites$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-unites'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '104b5ab3ce3d9605334cd5a69accee92';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-unites'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-unites'::TEXT;
  END IF;
  UPDATE manuel_sections SET partie = '[[Nom:referentiel]]' WHERE slug = 'referentiel-unites' AND partie = 'Référentiel';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-unites' AND partie = '[[Nom:referentiel]]') THEN parties_gardees := parties_gardees || 'referentiel-unites'::TEXT; END IF;
  -- ── roles ──
  t := $m194_roles$## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles internes : le **client**, propriétaire du compte, et [[det:gerant:le]]**[[nom:gerant]]**, collaborateur invité sur un périmètre précis. S'y ajoutent [[det:acheteur:le]]**[[nom:acheteur]]** — un client professionnel externe qui n'accède qu'à son portail de commande — et le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l'accès complet : [[nom:activite:pl]] et [[nom:labo:pl]], [[nom:referentiel]], [[nom:produit:pl]] et [[nom:fiche_technique:pl]], [[nom:stock:pl]], [[nom:vente:pl]], rapports, [[nom:fournisseur:pl]] — ainsi que les pages réservées au propriétaire :

- **[[Mon:activite:pl:Nom]]** : création et modification des sites ;
- **[[Nom:gerant:pl]]** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans [[le:espace_vente:Nom]] : **Config Charges** et **Rapport [[Nom:vente]]**.

### [[Le:gerant]] (collaborateur)

[[Le:gerant]] est [[acc:gerant:créé:créée]] par le client depuis la page [[[Nom:gerant:pl]]](#gerants) : nom, téléphone, e-mail, et surtout **[[le:activite:pl]] et [[nom:labo:pl]] qui lui sont assignés** (au moins un est obligatoire). [[acc:gerant:Il:Elle]] reçoit une invitation par e-mail et active [[acc:gerant:lui-même:elle-même]] son compte.

- Son périmètre est limité [[au:activite:pl]] et [[nom:labo:pl]] affectés : [[acc:gerant:il:elle]] y travaille au quotidien ([[nom:stock:pl]], [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]]…).
- Si l'option [[Court:acheteur:pl]] est active, [[acc:gerant:il:elle]] accède aussi [[det:espace_acheteurs:au]]**[[Nom:espace_acheteurs]]** (le carnet est commun au compte) ; [[son:vente:pl]] [[au:acheteur:pl]] sont [[acc:vente:limité:limitée:pl]] [[au:labo:pl]] de son périmètre.
- [[acc:gerant:Il:Elle]] ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques ([[nom:appro:pl]], [[nom:perte:pl]], [[nom:inventaire:pl]]), [[acc:gerant:il:elle]] ne peut modifier ou supprimer que les opérations qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] saisies.
- Le client peut à tout moment [[acc:gerant:le:la]] **désactiver** (accès suspendu, sans suppression), [[acc:gerant:le:la]] **réactiver**, renvoyer l'invitation ou [[acc:gerant:le:la]] supprimer.

Jusqu'à 3 comptes [[nom:gerant:pl]] sont inclus ; au-delà, chaque [[nom:gerant]] supplémentaire est [[acc:gerant:facturé:facturée]] **80 DT/mois** et [[acc:gerant:soumis:soumise]] à validation, dans la limite du quota de votre abonnement.

### [[Le:acheteur]] (portail de commande)

Si l'option [[Court:acheteur:pl]] est active, chaque [[nom:acheteur]] de votre carnet peut être **[[acc:acheteur:invité:invitée]]** à créer son compte portail. Ce rôle est externe et volontairement très limité :

- [[acc:acheteur:il:elle]] accède uniquement au **portail [[court:acheteur]]** : catalogue à ses tarifs, passage de commande, suivi de ses commandes et téléchargement de ses factures ;
- [[acc:acheteur:il:elle]] ne voit **rien de votre gestion** : ni vos quantités en [[nom:stock]], ni vos prix d'achat, ni aucune autre page de LabFlow ;
- vous gérez ses accès depuis le [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) : invitation, renvoi de l'invitation, désactivation ou suppression.

### Les modes du compte

| Mode | Effet |
|---|---|
| Actif | Compte opérationnel, toutes les fonctions disponibles |
| Lecture seule | Consultation possible, mais création et modification bloquées (abonnement impayé) |
| Bloqué / Désactivé | Accès suspendu |

- En **lecture seule**, un bandeau orange en haut de l'écran vous en informe, avec un bouton « Voir mon abonnement » pour régulariser.
- En **bloqué / désactivé**, un bandeau rouge vous invite à contacter l'administrateur.

### Points d'attention

:::attention
Le mode du compte s'applique à tous ses utilisateurs : si le compte passe en lecture seule, [[le:gerant:pl]] sont [[acc:gerant:eux:elles]] aussi [[acc:gerant:limité:limitée:pl]] à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n'est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [[[Nom:gerant:pl]]](#gerants) — créer et gérer les collaborateurs
- [Le portail [[court:acheteur]]](#acheteurs-portail) — l'espace de vos clients professionnels
- [Tableau de bord [[nom:gerant]]](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)$m194_roles$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'roles'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ed0648ae54315ebd004be5ae2ce7884c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'roles'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'roles'::TEXT;
  END IF;
  -- ── saisie-ventes ──
  t := $m194_saisie_ventes$## 🛒 Saisie [[du:vente:pl]]

Cet écran vous permet d'enregistrer [[le:vente:pl]] [[acc:vente:quotidien:quotidienne:pl]] de chaque [[nom:activite]] — en [[nom:vente]] [[acc:vente:direct:directe]] au comptoir comme via [[votre:prestataire:pl]] de livraison — puis d'en consulter l'historique complet. Vous le trouvez dans le menu **[[Nom:espace_vente]] → [[Pl:vente]] [[Court:activite:pl]]**.

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie [[du:vente:pl]] [[court:produit:pl]]**, **🧂 Saisie [[du:vente:pl]] [[court:supplement:pl]]**, **💎 Saisie [[du:vente:pl]] [[acc:vente:valorisés:valorisées]]** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]].
- Une barre d'outils : recherche par nom, champ **Date [[de:vente]]** et bouton **✓ Confirmer [[le:vente:pl]]**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer [[le:vente:pl]] d'une journée :

1. Choisissez [[le:activite]], puis l'onglet correspondant au type d'article ([[nom:produit:pl]], [[nom:supplement:pl]] ou valorisés).
2. Vérifiez la **date [[de:vente]]** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque [[nom:prestataire]].
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer [[le:vente:pl]]** : une fenêtre rappelle que [[le:vente]] déduira directement [[le:stock]] [[du:activite]] ; validez avec **✓ Confirmer**.

Consulter et gérer l'historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou [[nom:prestataire]]), **type [[de:produit]]** ([[nom:produit]], [[nom:supplement]], valorisé) et **[[nom:prestataire]]**.
2. Chaque ligne détaille l'article, son badge de type, le canal (🏪 Directe ou 🛵 nom [[du:prestataire]]), la quantité, le CA avec le prix unitaire appliqué, et l'auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l'historique en Excel ; cochez d'abord des lignes pour n'exporter que celles-ci.
4. Le bouton **Annuler** d'une ligne supprime [[le:vente]] et **réintègre les quantités en [[nom:stock]]** (une confirmation est demandée).

### Calculs

:::formule Chiffre d'affaires d'une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour [[le:vente]] au comptoir, prix [[nom:prestataire]] configuré pour chaque [[nom:prestataire]].
:::

À la confirmation, les quantités vendues sont déduites [[du:stock]] [[du:activite]] : [[le:article:pl]] [[acc:article:valorisé:valorisée:pl]] directement, [[le:produit:pl]] et [[nom:supplement:pl]] via la décomposition de leur [[nom:fiche_technique]] ([[nom:article:pl]] et sous-produits transformés) ; [[un:produit]] [[acc:produit:préparé:préparée]] [[au:labo]] est, [[acc:produit:lui:elle]], [[acc:produit:déduit:déduite]] [[acc:produit:tel quel:telle quelle]] [[du:stock]] [[de:pt:pl]] [[du:activite]]. [[Le:marge]] [[acc:marge:dégagé:dégagée]] est ensuite [[acc:marge:analysé:analysée]] dans le [rapport [[de:vente]]](#rapports-vente).

### Points d'attention

:::attention
Configurez le **prix [[nom:prestataire]]** de chaque article avant de saisir des quantités sur ce canal : une quantité saisie sans prix configuré est valorisée à 0 DT dans le chiffre d'affaires.
:::

:::attention
La confirmation déduit immédiatement [[le:stock]]. En cas d'erreur, utilisez le bouton **Annuler** dans l'historique : [[le:vente]] est [[acc:vente:supprimé:supprimée]] et [[le:stock]] [[acc:stock:réintégré:réintégrée]]. [[Un:gerant]] ne peut annuler que [[le:vente:pl]] qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] [[acc:vente:saisi:saisie:pl]].
:::

:::astuce
Seuls les articles **activés** en Configuration [[Court:vente]] apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l'écran de configuration des prix.
:::

### Voir aussi

- [Configuration [[Court:vente]]](#configuration-vente) — activer les articles et fixer les prix
- [[[Pl:vente]] [[Court:labo]]](#ventes-labo) — le pendant côté [[nom:labo_long]]
- [Rapports [[de:vente]]](#rapports-vente) — analyser CA et [[nom:marge:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — comprendre le déstockage$m194_saisie_ventes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'saisie-ventes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '5d2d7b3d5791155006acface6e7adec5';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'saisie-ventes'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = 'Saisie [[du:vente:pl]]' WHERE slug = 'saisie-ventes' AND titre = 'Saisie des ventes';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes' AND titre = 'Saisie [[du:vente:pl]]') THEN titres_gardes := titres_gardes || 'saisie-ventes'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_vente]]' WHERE slug = 'saisie-ventes' AND partie = 'Espace Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes' AND partie = '[[Nom:espace_vente]]') THEN parties_gardees := parties_gardees || 'saisie-ventes'::TEXT; END IF;
  -- ── stock-activites ──
  t := $m194_stock_activites$## 📦 [[Nom:stock]] [[Court:activite:pl]]

L'écran **[[Nom:stock]] [[Court:activite:pl]]** (menu **[[Nom:espace_activites]] → [[Nom:stock]] [[Court:activite:pl]]**) est le poste central de chaque [[nom:activite_desc]] : quantités disponibles, saisie [[du:appro:pl]], seuils d'alerte et déclaration [[du:perte:pl]]. [[Le:stock]] se consulte **[[nom:activite]] par [[nom:activite]]** : sélectionnez [[le:activite_desc]] grâce aux pastilles 🏪 en haut de l'écran — il n'existe pas de vue globale « [[acc:activite:Tous:Toutes]] ». [[Un:gerant]] ne voit que [[le:activite:pl]] qui lui sont [[acc:activite:affecté:affectée:pl]].

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **[[Nom:article]]** ([[acc:article:débloqué:débloquée]] après le choix d'une catégorie), **Nom** (recherche libre), **[[Nom:fournisseur]]** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **[[Nom:appro]]** regroupe les informations communes à la saisie : **Date [[de:appro:court]]** (obligatoire, entre le 1er janvier de l'année en cours et aujourd'hui), **[[Nom:fournisseur]]**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes.

[[Le:article:pl]] sont [[acc:article:groupé:groupée:pl]] par **catégories repliables** (cliquez sur l'en-tête pour ouvrir). [[Le:pt:pl]] apparaissent dans leurs propres catégories : **[[Nom:cat_pt_utilisable]]**, **[[Nom:cat_pt_vendable]]** et **[[Nom:cat_pt_valorise]]** (voir [le lexique [[du:pt:pl:court]]](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, lien 📋 Historique, date et quantité [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]] 📦 |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité disponible + détail : ↑ [[court:appro]], ⇄ transf, ↘ [[court:perte:pl]], [[Court:pt]] (consommé par vos productions), 💰 [[MAJ:vente]] |
| Coût Total | valeur [[du:stock]] en TTC (le montant HT s'affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d'achat HT unitaire (calculé automatiquement pour [[un:pt]]) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[nom:pt:pl]]) |

La couleur [[du:stock]] reflète le **seuil minimum** : 🔴 [[nom:stock]] [[acc:stock:inférieur:inférieure]] ou [[acc:stock:égal:égale]] au seuil, 🟠 juste au-dessus (jusqu'à seuil + 10 %), 🟢 au-delà.

:::formule [[Nom:stock]] [[acc:stock:actuel:actuelle]]
[[Nom:stock]] = [[Nom:appro:pl]] + [[Nom:transfert:pl]] [[acc:transfert:entrant:entrante:pl]] − Consommations ([[nom:vente:pl]], productions) − [[Nom:perte:pl]] ± Ajustements [[de:inventaire]]
:::

### Actions pas à pas

Enregistrer [[un:appro]] :

1. Sélectionnez [[le:activite]], puis renseignez le bloc [[Nom:appro]] : date, [[nom:fournisseur]] et n° de facture.
2. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
3. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
4. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut). Confirmez.
5. Si [[un:appro:court]] existe déjà à cette date pour [[un:article]], une confirmation supplémentaire affiche le cumul avant validation.

Produire [[un:pt]] : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec [[le:stock]] [[de:ingredient:pl]], et le prix se calcule automatiquement depuis [[le:recette]] ([production [[de:pt:pl:court]]](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités [[de:ingredient:pl]] réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'[[un:pt]] se règle aussi [[nom:activite]] par [[nom:activite]].

### Points d'attention

:::attention
[[Un:pt]] [[acc:pt:fabriqué:fabriquée]] [[det:labo:au]]**[[nom:labo]]** porte le badge **⇄ [[Court:transfert]] uniquement** : sa quantité ne se saisit pas ici, [[acc:pt:il:elle]] n'entre en [[nom:stock]] [[de:activite]] que par [[[nom:transfert]]](#transferts). Par ailleurs, une même validation ne peut pas mélanger production [[de:pt:pl:court]] et [[court:appro]] [[de:article:pl]] : dès qu'une quantité [[de:pt:court]] est saisie, les champs [[Nom:fournisseur]] et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ [[Nom:fournisseur]] affiche « ⚠ [[Aucun:fournisseur]] », créez d'abord [[det:fournisseur:votre:pl]][[[nom:fournisseur:pl]]](#fournisseurs) : le n° de facture est toujours exigé, et le choix d'[[un:fournisseur]] devient obligatoire dès qu'au moins [[un:fournisseur]] existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: [[Un:article]] [[acc:article:acheté:achetée]] 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
Le lien **📋 Historique** sous chaque [[nom:article]] affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, [[nom:fournisseur]], réf. facture) sans quitter l'écran, avec un bouton vers l'historique complet.
:::

### Voir aussi

- [Valeur [[du:stock]]](#calc-valeur-stock) — comment [[le:stock]] [[acc:stock:actuel:actuelle]] est [[acc:stock:calculé:calculée]]
- [HT et TTC](#calc-ht-ttc) · [Seuils d'alerte](#calc-seuils)
- [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique) · [[[Nom:transfert:pl]]](#transferts) · [Factures [[de:appro:court]]](#factures)$m194_stock_activites$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-activites'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'bd08b8d5f499a9cbf9664bb943b8241f';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-activites'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:stock]] [[Court:activite:pl]]' WHERE slug = 'stock-activites' AND titre = 'Stock Activités';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites' AND titre = '[[Nom:stock]] [[Court:activite:pl]]') THEN titres_gardes := titres_gardes || 'stock-activites'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'stock-activites' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'stock-activites'::TEXT; END IF;
  -- ── stock-labo ──
  t := $m194_stock_labo$## 🏭 [[Nom:stock]] [[Court:labo]]

Cet écran gère [[le:stock]] de [[votre:labo_long]][[acc:labo_long: central:]] : [[le:article:pl]] que vous y achetez et [[det:pt:le:pl]][[avecCourt:pt:pl]] que vous y fabriquez. Vous y accédez depuis [[le:espace_labo]] ; si vous possédez plusieurs [[nom:labo:pl]], une rangée de pastilles en haut de page permet de passer de [[acc:labo:l'un:l'une]] à l'autre — le menu latéral suit alors [[le:labo]] [[acc:labo:affiché:affichée]].

### Ce que vous voyez

Un bandeau rappelle le nom [[du:labo]] et propose le bouton **↗ Transfert** vers l'écran d'envoi [[au:activite:pl]] et [[au:labo:pl]] rattachés. En dessous : une barre de filtres (Catégorie, [[Nom:article]], Nom, [[Nom:fournisseur]], Réf. Facture), puis le bloc **[[Nom:appro]]** avec la Date [[de:appro:court]], [[le:fournisseur:Nom]], la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s'affiche entre parenthèses) et **Réinitialiser**.

[[Le:stock]] est [[acc:stock:présenté:présentée]] par catégories repliables :

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, badge **[[Court:pt]]** (et « ◆ Composé valorisé » pour les composés fabriqués [[au:labo]]), bouton 📋 Historique — les 5 derniers mouvements avec leur type : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]] (↗ [[acc:transfert:envoyé:envoyée]] ou ↙ [[acc:transfert:reçu:reçue]] [[du:labo]] qui vous alimente), [[Court:pt]], [[Court:perte]]… |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité restante et sa ventilation depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] : ↑ [[court:appro]] (achats et réceptions d'[[un:labo]] source), ⇄ [[nom:transfert:pl]], ↘ [[court:perte:pl]], consommation [[court:pt]] |
| Coût Total | valeur [[du:stock]] en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d'[[acc:appro:un:une]] [[nouveau:appro:court]] — le prix d'[[un:pt:court]] est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[court:pt:pl]] uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d'enregistrer.

### Actions pas à pas

Approvisionner [[un:article:pl]] :

1. Renseignez la date, [[le:fournisseur]] et le n° de facture dans le bloc [[Nom:appro]].
2. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
3. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) ; confirmez.

Produire [[un:pt:court]] ([[nom:labo:pl]] de production uniquement — [[un:labo]] [[acc:labo:configuré:configurée]] sans production, tel un économat, n'affiche pas [[de:pt:pl:court]]) :

1. Saisissez la **quantité produite** sur la ligne [[du:pt:court]] — aucun prix à saisir, son coût est calculé d'après les prix [[du:article:pl]] [[du:labo]].
2. Enregistrez : [[le:ingredient:pl]] [[du:recette]] **et les sous-PT** qu'[[acc:recette:il:elle]] contient sont déduits automatiquement [[du:stock]] [[du:labo]].
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster [[le:portion:pl]] réellement [[acc:portion:utilisé:utilisée:pl]] pour cette production.

Déclarer [[un:perte]] : bouton **📉 [[Court:perte]]**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche [[le:stock]] disponible, le prix unitaire retenu et le coût total [[du:perte]].

Définir un seuil : bouton **🔧 Seuil**. [[Le:stock]] s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

### Points d'attention

:::attention
On ne mélange pas [[court:appro]] [[de:article:pl]] et production [[de:pt:pl:court]] dans un même enregistrement : dès qu'une quantité est saisie sur [[un:pt:court]], les champs [[Nom:fournisseur]] et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
[[Un:perte]] ne peut pas dépasser [[le:stock]] disponible, ni porter une date antérieure [[acc:appro:au premier:à la première]] [[nom:appro]] [[du:article]].
:::

:::astuce
Si la date choisie correspond déjà à [[un:appro:court]] [[acc:appro:existant:existante]] pour [[un:article]], ses champs de saisie s'entourent d'orange : consultez l'historique 📋 avant d'enregistrer, car les quantités s'additionnent.
:::

L'affectation [[du:article:pl]] [[au:activite:pl]] (cases à cocher) se gère depuis la fiche [[du:article]] ([[[Nom:article:pl]]](#referentiel-articles)) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [[[Le:pt:pl]]](#lexique-pt) · [Le calcul d'une production](#calc-production-pt)
- [Les seuils d'alerte](#calc-seuils) · [La valeur [[du:stock]]](#calc-valeur-stock)
- [[[Nom:transfert:pl]] vers [[le:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts) · [Factures [[de:appro:court]]](#factures) · [[[Nom:perte:pl]]](#pertes)$m194_stock_labo$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-labo'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '76fa05d0c973690ead80d4fc82c0e1d4';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-labo'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:stock]] [[Court:labo]]' WHERE slug = 'stock-labo' AND titre = 'Stock Labo';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo' AND titre = '[[Nom:stock]] [[Court:labo]]') THEN titres_gardes := titres_gardes || 'stock-labo'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'stock-labo' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'stock-labo'::TEXT; END IF;
  -- ── support ──
  t := $m194_support$## 💬 Demandes & support

L'écran **Demandes** vous met en relation avec l'équipe LabFlow : besoin d'aide, [[nom:article_ingredient]] [[acc:article_ingredient:absent:absente]] du catalogue, ajout de capacité ([[nom:activite:pl]], [[nom:labo:pl]], [[nom:gerant:pl]], option [[Court:acheteur:pl]]), passage en formule Premium. Vous le trouvez dans le menu latéral, entrée **Demandes**. L'équipe répond sous 24 h.

### Ce que vous voyez

- Un bandeau d'en-tête avec le bouton **+ Nouvelle demande** et, le cas échéant, le nombre de demandes **en attente**.
- Une barre de filtres : par statut (**Toutes**, **En attente**, **Validées**, **Refusées**, avec compteurs) et par plage de dates.
- La liste de vos demandes, 5 par page : type, date, statut coloré (jaune = en attente, vert = validée, rouge = refusée) et résumé du contenu.
- Sous une demande traitée, l'encart **Réponse de l'administration**, avec la date de traitement.
- Si une demande a été créée par [[acc:gerant:l'un:l'une]] de [[votre:gerant:pl]], un badge « par … » en indique l'auteur.

### Les types de demandes

| Type | Usage |
|---|---|
| 💬 Besoin d'aide | Décrire un problème, poser une question, suggérer une fonctionnalité ou demander l'ajout d'[[un:article_ingredient]] au catalogue |
| ➕ Ajout de capacité | Ajouter [[un:activite:pl]], [[un:labo:pl]] ou [[un:gerant:pl]] — et activer l'option [[Court:acheteur:pl]] ou passer à un palier supérieur |
| ⭐ Passer en formule Premium | Proposé si votre compte est en formule *Activité Basique* : demande le déblocage [[du:espace_produits:Nom]] [[acc:espace_produits:complet:complète]] (validation par l'équipe LabFlow, sans avenant) |

Vos éventuelles anciennes demandes « 🥕 Ingrédient manquant » restent visibles dans le suivi, mais ce type n'est plus proposé à la création : pour [[un:article_ingredient]] [[acc:article_ingredient:absent:absente]] du catalogue, passez désormais par une demande **Besoin d'aide**.

### Actions pas à pas

**Envoyer une demande d'aide**

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Besoin d'aide**.
2. Décrivez votre besoin dans la zone de texte, puis cliquez sur **Envoyer la demande**.
3. Suivez son statut dans la liste : la cloche de notifications vous avertit quand elle est traitée.

**Demander un ajout de capacité (propriétaire du compte uniquement)**

1. Choisissez **Ajout de capacité** — ou passez par les boutons **⚡ Ajouter [[nom:activite:pl]]** / **⚡ Ajouter [[nom:labo:pl]]** de l'écran [[[Mon:activite:pl]]](#activites), affichés lorsque la limite de votre abonnement est atteinte.
2. Votre configuration actuelle s'affiche ; réglez avec les compteurs le nombre [[de:activite:pl]], [[de:labo:pl]] et [[de:gerant:pl]] supplémentaires. Le prix par unité et par mois s'affiche en DT ; si une promotion est active, l'ancien prix apparaît barré et le prix remisé en vert.
3. **Option [[Court:acheteur:pl]]** : le bloc 🤝 vous propose d'activer l'option ou de passer à un palier supérieur (jusqu'à 20, 50 ou 100 [[nom:acheteur:pl]]), avec le prix de chaque palier. Le nouveau palier **remplace** l'actuel — la différence de mensualité s'affiche. L'option nécessite au moins [[un:labo]], [[acc:labo:existant:existante]] ou [[acc:labo:ajouté:ajoutée]] dans la même demande.
4. Avant l'envoi, le **nouveau total estimé** de votre mensualité s'affiche en DT/mois, promotion comprise le cas échéant.
5. Après l'envoi, un **avenant** à votre contrat est généré : vous recevez par e-mail un lien de signature. Dès la signature, la capacité (et le palier [[nom:acheteur:pl]] demandé) est appliquée automatiquement à votre compte.
6. Une fois la demande validée, le bouton **Contrat avenant** vous permet de télécharger le document signé (PDF).

**Demander le passage en formule Premium (comptes Basique)**

1. Cliquez sur **+ Nouvelle demande**, puis sur la carte **⭐ Passer en formule Activité Premium** (également accessible depuis [Mon abonnement](#abonnement)).
2. La demande part immédiatement — une seule demande à la fois, l'équipe LabFlow la valide.
3. Dès validation, [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]] ([[nom:produit_compose:pl]], [[nom:fiche_technique:pl]], production) se déverrouille.

**Demander [[un:article_ingredient]] [[acc:article_ingredient:absent:absente]] du catalogue**

1. Vérifiez d'abord dans [[det:article:votre:pl]][[[Nom:article:pl]]](#referentiel-articles) que [[le:article_ingredient]] n'existe pas sous un autre nom ou une autre orthographe.
2. Envoyez une demande **Besoin d'aide** en précisant le **nom exact [[du:article_ingredient]]**, sa catégorie et son unité.
3. Une fois la demande traitée par l'administration, vous pouvez créer [[le:article]] dans [[det:referentiel:votre]][[[nom:referentiel]]](#referentiel-articles) — chaque compte gère ses propres [[nom:article:pl]].

**Annuler une demande**

1. Tant qu'une demande est **En attente**, le bouton **Supprimer** apparaît sur sa ligne (une confirmation vous est demandée).
2. Une fois traitée — validée ou refusée — elle ne peut plus être supprimée et reste dans votre suivi.

### Points d'attention

:::attention
La demande d'ajout de capacité est réservée au propriétaire du compte : elle engage l'abonnement via un avenant à signer. [[Le:gerant:pl]] n'y ont pas accès et ne peuvent envoyer que des demandes d'aide.
:::

:::regle
Le palier [[nom:acheteur:pl]] demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option [[Court:acheteur:pl]] exige au moins [[un:labo]]. À la signature de l'avenant, le module s'active tout seul : [[le:espace_acheteurs:Nom]] apparaît dans votre menu.
:::

:::astuce
Pour une réponse rapide, décrivez précisément votre besoin : l'écran concerné, [[le:activite]] ou [[le:labo]], ce que vous avez fait, ce que vous attendiez et ce qui s'est produit. Faites une demande par sujet : le suivi n'en sera que plus clair.
:::

### Voir aussi

- [Abonnement](#abonnement) et [Avenants](#onboarding-avenants) — l'impact d'un ajout de capacité
- [Le module [[Court:acheteur:pl]]](#acheteurs-module) — ce que couvre l'option
- [[[Mon:activite:pl]]](#activites), [[[Nom:gerant:pl]]](#gerants)
- [[[Nom:article:pl]]](#referentiel-articles) — [[votre:referentiel]] [[de:article:pl]]
- [Assistant IA](#assistant-ia) et [Questions fréquentes](#faq) — pour une réponse immédiate$m194_support$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'support'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '82d0ae1e30a3b9157a4416c7ac402d1d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'support'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'support'::TEXT;
  END IF;
  -- ── transferts ──
  t := $m194_transferts$## 🔄 [[Nom:transfert:pl]]

Cet écran envoie [[le:article:pl]] et [[det:pt:le:pl]][[avecCourt:pt:pl]] [[du:labo]] vers [[votre:activite:pl]] **et vers [[le:labo:pl]] qu'[[acc:labo:il:elle]] alimente** (un économat vers une cuisine, par exemple) : [[le:stock]] [[du:labo]] diminue, [[acc:stock:celui:celle]] de chaque destination augmente d'autant. Vous y accédez par le bouton **↗ Transfert** [[du:stock:Nom]] [[Court:labo]] ou depuis [[le:espace_labo]] ; les pastilles en haut de page permettent de changer [[de:labo]].

### Ce que vous voyez

Le bandeau propose un retour vers [[det:stock:le]]**[[Nom:stock]] [[Court:labo]]** et le bouton **📋 Historique [[Court:transfert:pl]]** (grisé tant qu'[[aucun:transfert]] n'existe). Suivent la barre de filtres ([[Nom:activite]], Catégorie, [[Nom:article]], Nom) et le bloc **[[Nom:transfert]]** : la Date [[Court:transfert]] et la **Réf. Facture / BL** (toutes deux obligatoires), puis les boutons **↗ Transférer** et **↺ Réinitialiser**.

Le tableau, par catégories repliables, affiche pour chaque [[nom:article]] : [[le:stock]] disponible [[au:labo]] (vert, orange ou rouge selon le niveau), le **prix unitaire TTC** de cession, puis **une colonne de quantité par destination** ([[nom:activite]] ou [[nom:labo]] [[acc:labo:rattaché:rattachée]]). Le bouton 📋 Historique déplie les 5 [[acc:transfert:derniers:dernières]] [[nom:transfert:pl]] [[du:article]] (dates, quantités par [[nom:activite]], prix, référence). Un panneau « Aperçu saisie » totalise en direct, en TTC, les montants de votre saisie.

Le prix de cession est proposé automatiquement au coût [[du:labo]] : coût de production TTC pour [[un:pt:court]], prix moyen pondéré converti en TTC pour [[un:article]]. Vous pouvez l'ajuster, mais il reste obligatoire pour toute ligne transférée.

### Actions pas à pas

1. Sélectionnez [[le:labo]], choisissez la date [[du:transfert]] et saisissez le n° de bon de livraison.
2. Saisissez les quantités dans les colonnes des destinations ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:rattaché:rattachée:pl]]) ; ajustez le prix de cession si nécessaire.
3. Cliquez sur **↗ Transférer** : la fenêtre « Confirmation [[de:transfert]] » récapitule les lignes groupées par destination (quantités, prix HT/TTC, totaux).
4. Cliquez sur **Confirmer [[le:transfert]]** : [[le:stock:pl]] sont [[acc:stock:mis:mise:pl]] à jour immédiatement.

Pour corriger ou exporter : ouvrez l'**Historique [[Court:transfert:pl]]** (filtres Du/Au, Destination, Catégorie), sélectionnez des lignes si besoin (elles seront surlignées dans le fichier), exportez en Excel, modifiez une quantité (✏️) ou supprimez [[un:transfert]] (🗑️ — [[le:stock:pl]] [[du:labo]] et [[du:activite]] sont alors [[acc:stock:recalculé:recalculée:pl]]).

### Points d'attention

:::regle
[[Un:article]] ou [[un:pt:court]] ne peut être [[acc:pt:transféré:transférée]] que vers une destination ([[nom:activite]] ou [[nom:labo]] [[acc:labo:rattaché:rattachée]]) où [[acc:pt:il:elle]] est **[[acc:pt:affecté:affectée]]** : sinon la case de quantité est remplacée par « — ». Si aucune destination n'apparaît, rattachez d'abord [[votre:activite:pl]] ou [[nom:labo:pl]] à [[ce:labo]] depuis [[[Pl:activite]] & [[pl:labo]]](#activites). Pour [[un:pt:court]] [[acc:pt:fabriqué:fabriquée]] [[au:labo]], [[le:transfert]] est le **seul** moyen d'approvisionner [[un:activite]]. Si [[aucun:article]] n'apparaît, affectez d'abord [[votre:article:pl]] [[au:activite:pl]] [[acc:activite:lié:liée:pl]] [[au:labo]] depuis la fiche de chaque [[nom:article]] ([[[Nom:article:pl]]](#referentiel-articles)).
:::

:::attention
Impossible de transférer plus que [[le:stock]] [[du:labo]] : la ligne passe en rouge avec l'excédent affiché, et l'enregistrement est bloqué avec le détail Disponible / Demandé / Excédent.
:::

:::attention
Si [[un:transfert]] existe déjà le même jour vers la même destination, une fenêtre de vérification détaille « Déjà envoyé / [[Nouveau:transfert]] / Total après ». Ne confirmez que s'il s'agit bien d'un envoi complémentaire : les quantités s'additionnent.
:::

:::astuce
Côté destination ([[nom:activite]] ou [[nom:labo]] [[acc:labo:rattaché:rattachée]]), la réception apparaît dans [[le:stock]] comme [[un:appro]] de type « [[Court:transfert]] », avec [[det:labo:le]]**[[nom:labo]] source comme [[nom:fournisseur]]**, au prix de cession saisi ; côté [[nom:labo]] source, la sortie porte le badge « ↗ [[Nom:transfert_abr]] → destination ».
:::

### Voir aussi

- [Le calcul [[du:transfert:pl]]](#calc-transferts) · [Le prix moyen pondéré](#calc-pmp)
- [[[Nom:stock]] [[Court:labo]]](#stock-labo) · [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Factures [[de:appro:court]]](#factures) · [Historique des mouvements](#historique)$m194_transferts$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'transferts'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '8cf942351126e2138f2f8b19bf1db8be';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'transferts'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'transferts'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Nom:transfert:pl]]' WHERE slug = 'transferts' AND titre = 'Transferts';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'transferts' AND titre = '[[Nom:transfert:pl]]') THEN titres_gardes := titres_gardes || 'transferts'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:stock]] & [[Court:appro]]' WHERE slug = 'transferts' AND partie = 'Stock & Appro';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'transferts' AND partie = '[[Nom:stock]] & [[Court:appro]]') THEN parties_gardees := parties_gardees || 'transferts'::TEXT; END IF;
  -- ── ventes-labo ──
  t := $m194_ventes_labo$## 🏭 [[Pl:vente]] [[Court:labo]]

[[Le:labo_long]] ne vend pas au comptoir : son « chiffre d'affaires » correspond [[det:transfert:au:pl]]**[[nom:transfert:pl]] [[acc:transfert:valorisé:valorisée:pl]]** vers [[votre:activite:pl]] et vers [[le:labo:pl]] qu'[[acc:labo_long:il:elle]] alimente — [[nom:article:pl]] comme [[nom:pt:pl]] (dont les composés valorisés, comptés au prix [[compl:labo]]). Cet écran présente cet historique avec une analyse prix / coût. Vous le trouvez dans le menu **[[Nom:espace_vente]] → [[Pl:vente]] [[Court:labo]]**.

### Ce que vous voyez

- Un **sélecteur [[de:labo]]** (🏭) pour choisir [[le:labo_long]], et un raccourci **📊 Rapport**.
- Une barre de filtres : période **Du / Au** avec bouton **🔍 Filtrer dates**, puis **Catégorie**, **[[Nom:article]]** (liste qui s'adapte à la catégorie choisie) et **Destination** ([[nom:activite]] 🏪 ou [[nom:labo]] [[acc:labo:rattaché:rattachée]] 🏭) ; bouton **✕ Réinitialiser** et **Exporter XLS**.
- Trois indicateurs calculés sur les lignes filtrées : **Valeur totale achat**, **Valeur totale [[court:transfert:pl]]** et **Écart total** (affiché en vert s'il est positif, en rouge sinon).
- Un tableau avec les colonnes *[[Nom:article]]* (unité et date), *Destination*, *Qté*, *Prix [[court:transfert]]* (total et prix unitaire), *Prix [[court:appro]]* (total et prix unitaire) et *Écart* (montant et pourcentage), avec une ligne de total en pied de tableau.

### Actions pas à pas

1. Sélectionnez [[le:labo]] [[acc:labo:concerné:concernée]].
2. Renseignez la période puis cliquez sur **🔍 Filtrer dates** ; les filtres catégorie, [[nom:article]] et destination s'appliquent, eux, instantanément.
3. Lisez l'écart ligne par ligne : il compare la valeur [[du:transfert]] au coût d'achat des matières, et le pied de tableau totalise l'ensemble.
4. Cliquez sur **Exporter XLS** pour télécharger l'historique ; cochez des lignes au préalable pour n'exporter que celles-ci.

:::formule Écart d'[[un:transfert]]
Écart = (prix [[de:transfert]] × quantité) − (prix moyen d'achat × quantité)
note: aussi affiché en pourcentage du coût d'achat ; un écart positif signifie que [[le:labo]] valorise au-dessus de son coût.
:::

### Différences avec [[le:vente:pl]] [[de:activite]]

| | [[Nom:vente:pl]] [[de:activite]] | [[Pl:vente]] [[Court:labo]] |
|---|---|---|
| Alimentation | Saisie manuelle des quantités | Automatique, à partir [[du:transfert:pl]] |
| Prix appliqué | Prix direct ou prix [[nom:prestataire]] | Prix [[de:transfert]] (par exemple le prix [[compl:labo]] d'un composé valorisé) |
| Client | Consommateur final | Vos propres [[nom:activite:pl]] et [[nom:labo:pl]] rattachés |
| Modification | Bouton Annuler dans l'historique | Écran en consultation seule |

### Points d'attention

:::attention
Sur certaines lignes, le prix d'achat moyen peut être indisponible (affiché « — ») : l'écart n'est alors pas calculé pour cette ligne et la valeur d'achat totale s'en trouve minorée.
:::

:::attention
Les indicateurs portent uniquement sur les lignes filtrées : pensez à réinitialiser les filtres pour retrouver la vision complète.
:::

:::astuce
Un écart négatif récurrent sur [[un:article]] signale un prix [[compl:labo]] inférieur au coût réel d'achat : revoyez le prix de ce composé valorisé pour ne pas transférer à perte.
:::

### Voir aussi

- [[[Nom:transfert:pl]]](#transferts) — l'opération qui alimente cet écran
- [Calcul [[du:transfert:pl]]](#calc-transferts) et [PMP](#calc-pmp) — d'où viennent les valeurs
- [Lexique [[du:pt:pl]]](#lexique-pt) — comprendre les composés valorisés
- [[[Nom:stock]] [[court:labo]]](#stock-labo) et [Rapports [[court:labo]]](#rapports-labo)$m194_ventes_labo$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'ventes-labo'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ed4996a44ff3a774aa32bd68f4d79ab6';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'ventes-labo'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'ventes-labo'::TEXT;
  END IF;
  UPDATE manuel_sections SET titre = '[[Pl:vente]] [[Court:labo]]' WHERE slug = 'ventes-labo' AND titre = 'Ventes Labo';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'ventes-labo' AND titre = '[[Pl:vente]] [[Court:labo]]') THEN titres_gardes := titres_gardes || 'ventes-labo'::TEXT; END IF;
  UPDATE manuel_sections SET partie = '[[Nom:espace_vente]]' WHERE slug = 'ventes-labo' AND partie = 'Espace Vente';
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'ventes-labo' AND partie = '[[Nom:espace_vente]]') THEN parties_gardees := parties_gardees || 'ventes-labo'::TEXT; END IF;
  RAISE NOTICE '194 : % fiche(s) balisée(s), % déjà balisée(s), % gardée(s) : % ; titres gardés : % ; parties gardées : % ; sans terme : %',
    balisees, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(parties_gardees, ', '), ''), 'aucune'),
    'historique-paiements, onboarding-activation';
END
$m194$;
