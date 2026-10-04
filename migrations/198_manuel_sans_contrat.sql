-- 198 — Lot 3, étape 5 : LabFlow est sans engagement — plus de contrat, d'avenant ni de résiliation dans le manuel et la base de connaissances.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["abonnement","assistant-ia","compte","faq","historique-paiements","lexique","onboarding-activation","onboarding-avenants","onboarding-configuration","onboarding-contrat","onboarding-suivi","support"],"titres":["onboarding-avenants","onboarding-contrat"],"entrees":["abonnement et capacité"],"variantes":["hotellerie/lexique","hotellerie/onboarding-configuration","usine/lexique","usine/onboarding-configuration"]}

DO $m198$
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
  -- ── abonnement ──
  t := $m198_abonnement$## 💳 Mon abonnement

Cet écran récapitule votre formule LabFlow : configuration incluse, formule d'activités, option [[Court:acheteur:pl]], tarifs, promotions actives et état du compte. Vous le trouvez en bas du menu latéral, entrée **Mon abonnement**.

### Ce que vous voyez

Le bandeau rappelle votre date de début d'abonnement et affiche l'**état du compte** :

| État | Signification |
|---|---|
| ✅ Actif | Compte pleinement opérationnel |
| ⚠️ Lecture seule | Paiement en attente — création et modification bloquées |
| 🚫 Suspendu | Compte suspendu, contactez l'administrateur |
| 📦 Archivé | Compte archivé suite à non-paiement |

- **⚙️ Votre configuration** : le nombre [[det:activite:de:pl]]**[[nom:activite:pl]]**, [[det:labo:de:pl]]**[[nom:labo:pl]]** et [[det:gerant:de:pl]]**[[nom:gerant:pl]]** inclus (mention *Non inclus* sinon), la **base [[court:acheteur:pl]]** avec son palier (« jusqu'à N [[nom:acheteur:pl]] ») quand l'option est active, votre **formule d'activités** (badge 📦 *Activité Basique* ou 💎 *Activité Premium*, dès qu'[[un:activite]] est [[acc:activite:inclus:incluse]]) et une éventuelle **prolongation** accordée en jours.
- **💰 Votre tarification** : le détail de la **tarification mensuelle** poste par poste ([[nom:activite:pl]] selon la formule, [[nom:labo:pl]] et [[nom:gerant:pl]] avec leur prix unitaire en DT, et — si elle est active — la ligne **🤝 Option [[Court:acheteur:pl]]** avec son palier « jusqu'à N [[nom:acheteur:pl]] ») et le **Total mensuel**. Si une promotion s'applique, l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée* et la **période de la promotion** : « Du … au … à ce prix — à partir du lendemain, tarif normal », ou la mention *promotion permanente*. Le cas échéant, la section **Tarification onboarding** affiche les frais d'intégration (montant unique en DT) et leur statut (payé, en attente…).
- Des bandeaux **🏷️ Promotion — Supplément [[Nom:activite]] / [[Nom:labo]] / [[Nom:gerant]]** apparaissent quand une promotion est active sur un supplément : gratuité, pourcentage de réduction ou prix fixe, avec sa date de fin ou la mention *Permanente*.
- **⭐ Passage en formule Premium** : si votre compte est en formule *Activité Basique*, un bouton vous permet de demander le passage en *Premium* ([[Nom:espace_produits]] [[acc:espace_produits:complet:complète]] : [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]], production). La demande est validée par l'équipe LabFlow ; en attendant, la mention ⏳ *Demande en attente* s'affiche.

### Actions pas à pas

1. **Passer en formule Premium** (comptes Basique) : cliquez sur le bouton de demande — dès validation, [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]] se déverrouille.
2. **Demander plus [[de:activite:pl]], [[de:labo:pl]] ou [[de:gerant:pl]]** : la demande de supplément se fait depuis l'écran [[[Nom:activite:pl]]](#activites) (bouton ⚡ quand le quota est atteint) ou via la page [Demandes](#support). Les promotions de supplément affichées ici s'appliqueront au tarif.
3. **Activer l'option [[Court:acheteur:pl]] ou changer de palier** : passez par la page [Demandes](#support) (Ajout de capacité) — le palier s'applique dès la validation de votre demande par l'équipe LabFlow.

### Points d'attention

:::attention
Un retard de paiement fait passer le compte en **lecture seule** (consultation possible, mais plus de saisie), puis peut mener à la suspension. Régularisez votre mensualité pour rétablir l'accès complet.
:::

:::regle
LabFlow est **sans engagement** : il n'y a ni contrat ni avenant à signer ou à télécharger. Pour arrêter (résilier) votre abonnement, prévenez l'équipe LabFlow : votre accès reste ouvert jusqu'à la fin du mois payé.
:::

:::astuce
Vérifiez les bandeaux de promotion avant de demander un supplément : une promotion active peut rendre l'ajout d'[[un:labo]] ou d'[[un:gerant]] temporairement gratuit ou remisé.
:::

### Voir aussi

- [Historique des paiements](#historique-paiements) — mensualités et factures
- [Création de votre compte](#onboarding-contrat) · [Faire évoluer votre abonnement](#onboarding-avenants)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — ce que couvre l'option
- [[[Nom:activite:pl]] & [[nom:labo:pl]]](#activites) · [Comptes [[nom:gerant:pl]]](#gerants) · [Support](#support)$m198_abonnement$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'abonnement'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'a52d65609c412c23aca9708e1d536ce6';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'abonnement'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'abonnement'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'abonnement' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'abonnement'::TEXT; END IF;
  -- ── assistant-ia ──
  t := $m198_assistant_ia$## 🤖 Assistant IA

L'assistant IA de LabFlow répond en langage naturel à vos questions sur **vos données** ([[nom:stock]], [[nom:perte:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]], coûts) et sur **le fonctionnement de LabFlow** : il connaît ce manuel et peut vous guider pas à pas. Il s'affiche via le bouton 🤖 de la barre du haut (à côté de la cloche de notifications) **pendant votre mise en route** : le panneau montre l'avancement de votre configuration étape par étape (vos unités par type — par exemple « 1/2 Restaurant · 0/1 Cuisine » selon votre domaine —, [[nom:referentiel]], [[nom:article:pl]], [[nom:fournisseur:pl]], [[nom:produit:pl]], premières saisies, carnet [[de:acheteur:pl]] si le module est actif), avec des questions suggérées pour l'étape en cours. Une fois votre configuration terminée, le guide se retire automatiquement — et il revient de lui-même si un ajout de capacité apporte de nouveaux éléments à configurer ([[nom:activite]], [[nom:labo]], module [[Court:acheteur:pl]]…). Le chat s'ouvre par-dessus votre écran, sans vous faire quitter la page en cours.

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
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites), [[[Nom:perte:pl]]](#pertes), [Rapports](#rapports)$m198_assistant_ia$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'assistant-ia'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '874bbddc72cdb1c62ba6e693d18cad34';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'assistant-ia'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'assistant-ia'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'assistant-ia' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'assistant-ia'::TEXT; END IF;
  -- ── compte ──
  t := $m198_compte$## 👤 Mon compte

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
Votre e-mail est votre identifiant de connexion : c'est aussi l'adresse qui reçoit vos factures et les e-mails de LabFlow. Vérifiez-le soigneusement avant d'enregistrer un changement.
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
- [Demandes et support](#support) — contacter l'assistance$m198_compte$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'compte'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '97068182631cc111a0ffa5e4ec11cd7b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'compte'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'compte'::TEXT; END IF;
  -- ── faq ──
  t := $m198_faq$## ❓ Questions fréquentes

Les réponses courtes aux questions les plus posées. Pour le détail, suivez les liens vers les fiches concernées.

### Puis-je modifier [[un:appro]] déjà [[acc:appro:saisi:saisie]] ?

Oui, dans la plupart des cas : ouvrez l'[historique [[du:appro:pl]]](#historique) [[du:activite]] ou [[det:labo:du]][[[nom:labo]]](#stock-labo) [[acc:labo:concerné:concernée]] et corrigez la ligne. Attention : la correction recalcule le [prix moyen pondéré](#calc-pmp) [[du:article]], donc la valeur de [[votre:stock]] et les coûts qui en découlent peuvent évoluer — c'est normal (voir [Pourquoi mes chiffres ont changé ?](#faq-chiffres)).

### Pourquoi je ne peux pas supprimer [[ce:article]] ?

[[Un:article]] déjà [[acc:article:utilisé:utilisée]] — [[acc:article:présent:présente]] dans [[det:fiche_technique:un]][[[nom:fiche_technique]]](#fiches-techniques) ou dans vos historiques [[de:appro:pl]], [[de:stock:pl]] ou [[de:vente:pl]] — ne peut pas être [[acc:article:supprimé:supprimée]] : sa suppression casserait la traçabilité de vos coûts et de [[votre:stock:pl]]. Retirez-[[acc:article:le:la]] plutôt de [[votre:recette:pl]] [[acc:recette:actif:active:pl]] ; [[acc:article:il:elle]] restera visible dans les historiques.

### Comment ajouter [[un:activite]] ou [[un:labo]] ?

Si votre abonnement dispose encore de capacité, créez-les directement dans [[[Mon:activite:pl]]](#activites). Sinon, envoyez une demande d'**Ajout de capacité** depuis l'écran [Demandes](#support) : la capacité est ajoutée automatiquement dès la validation de votre demande par l'équipe LabFlow (voir [Faire évoluer votre abonnement](#onboarding-avenants)).

### Pourquoi [[ce:produit]] n'est-[[acc:produit:il:elle]] pas approvisionnable directement dans [[mon:activite]] ?

C'est [[un:produit]] [[acc:produit:fabriqué:fabriquée]] par [[det:labo:votre]]**[[nom:labo]]** ([[nom:produit_utilisable]] d'origine [[nom:labo]] ou composé valorisé) : côté [[nom:activite]], [[acc:produit:il:elle]] n'entre en [[nom:stock]] que par **[[nom:transfert]]** depuis [[le:labo]], jamais par saisie directe [[de:appro]]. Voir [[[Nom:transfert:pl]]](#transferts) et [le lexique [[du:pt:pl]]](#lexique-pt).

### Que se passe-t-il si mon compte passe en lecture seule ?

Vous continuez à consulter tous vos écrans, historiques et rapports, mais toute saisie ([[nom:appro:pl]], [[nom:vente:pl]], [[nom:inventaire:pl]], productions…) est bloquée jusqu'à régularisation. Consultez votre [abonnement](#abonnement) et votre [historique de paiements](#historique-paiements), ou contactez l'équipe via [Demandes](#support).

### Comment retrouver une facture ?

Les **factures [[de:appro]]** se trouvent dans l'écran [Factures](#factures) de chaque [[nom:activite]] ou [[nom:labo]] : elles sont générées à la validation et re-téléchargeables à tout moment. Les **paiements d'abonnement** se consultent dans l'[historique des paiements](#historique-paiements).

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

Depuis l'écran [[de:stock]] [[du:activite]] ([[[Nom:stock]] [[du:activite:pl]]](#stock-activites)) ou [[du:labo]] ([[[Nom:stock]] [[du:labo]]](#stock-labo)) : l'action **Enregistrer [[un:perte]]** sur la ligne [[du:article]] ou [[du:produit]] vous demande la quantité, le type [[de:perte]] (avarie ou déchet) et la date. [[Le:perte]] est [[acc:perte:déduit:déduite]] [[du:stock]] et [[acc:perte:valorisé:valorisée]] en TTC dans vos rapports — détail dans [[[Nom:perte:pl]]](#pertes).$m198_faq$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'faq'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '97b4fa1098230952695d9b929f388fe3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'faq'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'faq'::TEXT; END IF;
  -- ── historique-paiements ──
  t := $m198_historique_paiements$## 🧾 Historique des paiements

Cet écran retrace toutes les mensualités de votre abonnement : ce qui est payé, ce qui arrive, ce qui est en retard — avec vos factures téléchargeables. Vous le trouvez en bas du menu latéral, entrée **Historique paiements**.

### Ce que vous voyez

- **📅 Prochaines échéances** : un encadré liste jusqu'à trois mensualités à venir, avec le mois, le montant en DT et le badge *En attente*. Il n'apparaît que s'il y a des échéances futures.
- Une **barre de filtres** : *Mois / Année* (sélecteur de mois) et *Statut*, avec un compteur d'enregistrements et un bouton de réinitialisation.
- Le **tableau d'historique** :

| Colonne | Contenu |
|---|---|
| Mois | Le mois de la mensualité (ex. « janvier 2026 ») |
| Montant | Le montant en DT, ou la mention *Gratuit* |
| Statut | Payé · Impayé · En attente · Remisé · Gratuit |
| Date paiement | La date d'encaissement, quand elle existe |
| Facture | Bouton 🧾 *Facture* pour les mensualités payées |

Les statuts se lisent ainsi : **Payé** (réglé, avec sa date), **En attente** (mois courant ou à venir, pas encore réglé), **Impayé** (mois passé non réglé), **Remisé** (mensualité couverte par une remise) et **Gratuit** (mensualité offerte, dans le cadre d'une promotion par exemple).

### Actions pas à pas

1. **Télécharger une facture** : sur la ligne d'une mensualité *Payé*, cliquez le bouton **🧾 Facture** — le PDF s'enregistre sur votre appareil. Si la facture n'est pas disponible pour ce paiement, un message vous l'indique.
2. **Retrouver un mois précis** : utilisez le filtre *Mois / Année*, puis affinez avec le filtre *Statut* si besoin.
3. **Anticiper les échéances** : consultez l'encadré *Prochaines échéances* en haut de page pour connaître les montants attendus des prochains mois.
4. **Repartir de zéro** : le bouton de réinitialisation efface les filtres et réaffiche tout l'historique.

### Points d'attention

:::attention
Une mensualité passée non réglée bascule automatiquement en **Impayé**. Les impayés font passer votre compte en lecture seule puis peuvent mener à sa suspension : consultez l'écran [Mon abonnement](#abonnement) pour connaître l'état exact de votre compte.
:::

:::astuce
Le bouton Facture n'existe que pour les mensualités payées : téléchargez-les au fil de l'eau pour votre comptabilité plutôt que de les rechercher en fin d'exercice.
:::

### Voir aussi

- [Mon abonnement](#abonnement) — tarification, promotions et état du compte
- [Support](#support) — en cas de désaccord sur une mensualité$m198_historique_paiements$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'historique-paiements'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '9d1f98e3a0fcf8f94ece6bda2f2f5766';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'historique-paiements'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'historique-paiements'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'historique-paiements' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'historique-paiements'::TEXT; END IF;
  -- ── lexique ──
  t := $m198_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **[[Nom:acheteur]]** | Client professionnel (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : épicerie, revendeur, restaurant… Il peut être invité sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **[[Nom:activite]]** | [[Nom:activite_desc]] ou cuisine [[acc:activite_desc:exploité:exploitée]] par votre compte : restaurant, pâtisserie, kiosque… Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **Ajout de capacité** | Demande faite depuis la page Demandes pour ajouter [[un:activite:pl]], [[un:labo:pl]] ou [[un:gerant:pl]], ou pour activer l'option [[Court:acheteur:pl]] ou en changer le palier. Dès que l'équipe LabFlow la valide, la capacité est ajoutée, sans document à signer. |
| **[[Court:appro]] (approvisionnement)** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro:court]] peut provenir d'un achat auprès d'[[un:fournisseur]], d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (farine, beurre, boisson…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
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
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$m198_lexique$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'lexique'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'abe5dd9e375046d8e59f783b5c8a46c5';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'lexique'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'lexique'::TEXT; END IF;
  -- ── onboarding-activation ──
  t := $m198_onboarding_activation$## 🔑 Activation de votre compte

Dès la création de votre compte par l'équipe LabFlow, vous recevez l'email « Bienvenue sur LabFlow — Activez votre compte ». Il contient le lien qui vous permet de définir votre mot de passe et d'accéder à votre espace.

### Ce que vous voyez

La page d'activation vous accueille par votre nom et rappelle l'adresse email de votre compte. Elle comporte :

- un champ **Mot de passe**, avec un bouton œil pour afficher ou masquer la saisie ;
- des pastilles de contrôle qui passent au vert au fur et à mesure de la frappe : « Au moins 8 caractères », « Une majuscule », « Une minuscule », « Un chiffre », « Un caractère spécial » ;
- un champ **Confirmer le mot de passe** ;
- le bouton **Activer mon compte**, qui ne devient actif que lorsque toutes les règles sont respectées et que les deux saisies correspondent.

### Actions pas à pas

1. Ouvrez l'email d'activation et cliquez sur le bouton **Activer mon compte** (le lien direct figure aussi en bas de l'email).
2. Choisissez votre mot de passe en respectant les règles affichées : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, %, _, - ou #).
3. Répétez le mot de passe dans le champ de confirmation.
4. Cliquez sur **Activer mon compte** : vous êtes redirigé vers la page de connexion, avec votre adresse email déjà pré-remplie.
5. Saisissez votre nouveau mot de passe : vous voilà connecté pour la première fois.

### Points d'attention

:::attention
Le lien d'activation est valable **48 heures**. Passé ce délai, la page affiche « Lien invalide ou expiré » : contactez l'administration, qui vous renverra une nouvelle invitation valable 48 heures.
:::

:::regle
Règles du mot de passe : minimum 8 caractères, au moins une majuscule, une minuscule, un chiffre et un caractère spécial.
:::

:::astuce
Utilisez le bouton œil pour vérifier votre saisie avant de valider, et conservez votre mot de passe en lieu sûr : il vous sera demandé à chaque connexion.
:::

### Voir aussi

- [Configuration initiale](#onboarding-configuration)
- [Création de votre compte](#onboarding-contrat)
- [Mon compte](#compte)$m198_onboarding_activation$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-activation'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '6d18eb0efd5a42a64f54a7e39ad6e99d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-activation'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-activation'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-activation' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'onboarding-activation'::TEXT; END IF;
  -- ── onboarding-avenants ──
  t := $m198_onboarding_avenants$## 📑 Faire évoluer votre abonnement

Votre abonnement évolue avec votre entreprise : vous pouvez à tout moment demander [[un:activite:pl]], [[nom:labo:pl]] ou [[nom:gerant:pl]] supplémentaires — ou activer l'option [[Court:acheteur:pl]] ou changer de palier — depuis la page **Demandes** du menu. Chaque demande est soumise à la validation de l'équipe LabFlow. LabFlow est **sans engagement** : il n'y a aucun document à signer.

### Ce que vous voyez

- le bouton **+ Nouvelle demande** en haut de la page ;
- la liste de vos demandes avec leur statut — **En attente**, **Validée** ou **Refusée** — filtrable par statut et par période ;
- pour une demande traitée : la réponse de l'administration, lorsqu'elle en a laissé une.

### Demander de la capacité supplémentaire

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Ajout de capacité**.
2. Le formulaire rappelle votre configuration actuelle et affiche le prix de chaque supplément en DT, par unité et par mois ([[nom:activite]], [[nom:labo]], [[nom:gerant]]), promotions éventuelles comprises.
3. Réglez les compteurs + / − et, si vous le souhaitez, choisissez un **palier de l'option [[Court:acheteur:pl]]** (activation ou passage à un palier supérieur — le prix du palier s'affiche) ; le bloc « Nouveau total estimé » calcule en direct votre future mensualité en DT.
4. Cliquez sur **Envoyer la demande** : elle est transmise à l'équipe LabFlow.
5. Dès sa validation, la capacité supplémentaire est **appliquée automatiquement** à votre compte : la demande passe en « Validée », vous recevez une notification et un email de confirmation, et vous pouvez utiliser vos [[nouveau:activite:pl]], [[nom:labo:pl]], [[nom:gerant:pl]] — et, le cas échéant, votre nouveau palier [[nom:acheteur:pl]] — sans autre démarche.

### Arrêter votre abonnement

Vous pouvez arrêter (résilier) votre abonnement à tout moment : prévenez l'équipe LabFlow. Votre accès reste ouvert jusqu'à la fin du mois payé ; il n'y a aucun document à signer.

### Points d'attention

:::attention
Tant que la demande n'est pas validée, elle reste « En attente » et la capacité n'est pas ajoutée. Une demande en attente peut être supprimée si vous changez d'avis (bouton « Supprimer »).
:::

:::regle
Le palier [[nom:acheteur:pl]] demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option nécessite au moins [[un:labo]] — [[acc:labo:existant:existante]] ou [[acc:labo:ajouté:ajoutée]] dans la même demande.
:::

:::astuce
Le total estimé tient compte des promotions actives : le prix de base apparaît barré et le prix remisé s'affiche à côté.
:::

### Voir aussi

- [[[Mon:activite:pl]]](#activites) · [[[Nom:gerant:pl]]](#gerants)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Mon abonnement](#abonnement) · [Historique des paiements](#historique-paiements)
- [Demandes & support](#support)$m198_onboarding_avenants$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-avenants'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4c9cddad5b6d8d3ca79235839eea1308';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-avenants'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-avenants'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-avenants' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'onboarding-avenants'::TEXT; END IF;
  UPDATE manuel_sections SET titre = 'Faire évoluer votre abonnement' WHERE slug = 'onboarding-avenants' AND titre = 'Avenants & résiliation'
    AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t);
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-avenants' AND titre = 'Faire évoluer votre abonnement') THEN titres_gardes := titres_gardes || 'onboarding-avenants'::TEXT; END IF;
  -- ── onboarding-configuration ──
  t := $m198_onboarding_configuration$## 🧭 Configuration initiale

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
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Faire évoluer votre abonnement](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$m198_onboarding_configuration$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-configuration'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '794a5b32a2476bbe4e0088e07744f3b0';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-configuration'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-configuration'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-configuration' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'onboarding-configuration'::TEXT; END IF;
  -- ── onboarding-contrat ──
  t := $m198_onboarding_contrat$## ✍️ Création de votre compte

Votre parcours LabFlow commence avant même votre première connexion : l'équipe LabFlow crée votre compte, et vous recevez aussitôt l'email qui vous permet de l'activer. LabFlow est **sans engagement** : il n'y a aucun contrat à signer.

### Comment se déroule cette étape

1. **Création du compte.** L'équipe LabFlow enregistre vos informations (nom, email, téléphone, adresse) ainsi que la configuration de votre abonnement : nombre [[de:activite:pl]], [[de:labo:pl]] et [[de:gerant:pl]] inclus, frais d'intégration et mensualité en DT, promotions éventuelles.
2. **Réception de l'email d'activation.** Vous recevez un email intitulé « Bienvenue sur LabFlow — Activez votre compte », contenant le bouton **Activer mon compte** (voir [Activation de votre compte](#onboarding-activation)).

### Si l'email n'arrive pas

1. Vérifiez votre dossier **courrier indésirable (spam)** : les emails LabFlow y sont parfois classés.
2. Si l'email est arrivé mais que le bouton ne fonctionne pas, copiez le **lien direct** écrit en toutes lettres sous le bouton et collez-le dans votre navigateur.
3. Sinon, contactez l'équipe LabFlow, qui vérifiera votre dossier et relancera l'envoi si nécessaire.

:::astuce
Une fois votre compte activé, vous retrouvez votre configuration et vos tarifs à tout moment sur la page « Mon abonnement ».
:::

### Voir aussi

- [Activation de votre compte](#onboarding-activation)
- [Suivi de votre mise en route](#onboarding-suivi)
- [Mon abonnement](#abonnement)$m198_onboarding_contrat$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-contrat'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '0c5b13fcb9275c015675400efbad814c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-contrat'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-contrat'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-contrat' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'onboarding-contrat'::TEXT; END IF;
  UPDATE manuel_sections SET titre = 'Création de votre compte' WHERE slug = 'onboarding-contrat' AND titre = 'Création du compte & signature du contrat'
    AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t);
  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-contrat' AND titre = 'Création de votre compte') THEN titres_gardes := titres_gardes || 'onboarding-contrat'::TEXT; END IF;
  -- ── onboarding-suivi ──
  t := $m198_onboarding_suivi$## 🚀 Suivi de votre mise en route

Bienvenue sur LabFlow ! Cette page vous accompagne pendant vos premiers pas : la liste de contrôle affichée au-dessus de ce texte reflète votre progression **d'après vos données réelles**. Chaque étape se coche automatiquement dès qu'elle est accomplie — vous n'avez rien à valider vous-même.

Votre mise en route se déroule en quatre temps, chacun détaillé dans une fiche dédiée :

1. [Création de votre compte](#onboarding-contrat) — votre compte est créé par notre équipe et vous recevez aussitôt votre email d'activation.
2. [Activation de votre compte](#onboarding-activation) — vous définissez votre mot de passe grâce au lien reçu par email, puis vous vous connectez pour la première fois.
3. [Configuration initiale](#onboarding-configuration) — vous créez vos unités — [[nom:activite:pl]] et [[nom:labo:pl]], ou les types propres à votre domaine : la liste de contrôle affiche l'avancement par type, par exemple « 1/2 Restaurant · 0/1 Cuisine » —, constituez [[votre:referentiel]] [[de:article:pl]] et saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].
4. [Faire évoluer votre abonnement](#onboarding-avenants) — pour ajouter de la capacité par la suite ([[nom:activite:pl]], [[nom:labo:pl]] ou [[nom:gerant:pl]] supplémentaires).

:::astuce
Revenez sur cette page à tout moment : chaque étape est cliquable et vous conduit à l'écran concerné ; la liste vous indique toujours la prochaine action à réaliser et se met à jour à chaque visite au fil de votre avancement.
:::

### Voir aussi

- [Démarrage](#demarrage)
- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)$m198_onboarding_suivi$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'onboarding-suivi'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '98056f9fd43080357ddc2a3484751a8b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-suivi'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'onboarding-suivi'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-suivi' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'onboarding-suivi'::TEXT; END IF;
  -- ── support ──
  t := $m198_support$## 💬 Demandes & support

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
| ⭐ Passer en formule Premium | Proposé si votre compte est en formule *Activité Basique* : demande le déblocage [[du:espace_produits:Nom]] [[acc:espace_produits:complet:complète]] (validation par l'équipe LabFlow) |

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
5. Après l'envoi, la demande est traitée par l'équipe LabFlow : dès sa validation, la capacité (et le palier [[nom:acheteur:pl]] demandé) est appliquée automatiquement à votre compte, et vous recevez un e-mail de confirmation.

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
La demande d'ajout de capacité est réservée au propriétaire du compte : elle modifie l'abonnement et sa mensualité. [[Le:gerant:pl]] n'y ont pas accès et ne peuvent envoyer que des demandes d'aide.
:::

:::regle
Le palier [[nom:acheteur:pl]] demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option [[Court:acheteur:pl]] exige au moins [[un:labo]]. À la validation de la demande, le module s'active tout seul : [[le:espace_acheteurs:Nom]] apparaît dans votre menu.
:::

:::astuce
Pour une réponse rapide, décrivez précisément votre besoin : l'écran concerné, [[le:activite]] ou [[le:labo]], ce que vous avez fait, ce que vous attendiez et ce qui s'est produit. Faites une demande par sujet : le suivi n'en sera que plus clair.
:::

### Voir aussi

- [Abonnement](#abonnement) et [Faire évoluer votre abonnement](#onboarding-avenants) — l'impact d'un ajout de capacité
- [Le module [[Court:acheteur:pl]]](#acheteurs-module) — ce que couvre l'option
- [[[Mon:activite:pl]]](#activites), [[[Nom:gerant:pl]]](#gerants)
- [[[Nom:article:pl]]](#referentiel-articles) — [[votre:referentiel]] [[de:article:pl]]
- [Assistant IA](#assistant-ia) et [Questions fréquentes](#faq) — pour une réponse immédiate$m198_support$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'support'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '70381d74e6f332a160942fea9faa0056';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'support'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'support'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'support' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'support'::TEXT; END IF;
  -- ── base : abonnement et capacité ──
  t := $k198_abonnement_et_capacite$L'abonnement définit la capacité souscrite du client : nombre [[de:activite:pl]], [[de:labo:pl]] et [[de:gerant:pl]], plus le forfait mensuel et l'onboarding. LabFlow est sans engagement : il n'existe ni contrat, ni avenant, ni acte de résiliation — rien à signer, rien à télécharger. À la création du compte, le client reçoit directement l'email d'activation. Le mode du compte (actif, lecture seule, désactivé) dépend du paiement. Augmenter la capacité se fait par une demande d'ajout de capacité (page Demandes, titulaire du compte uniquement), appliquée dès sa validation par l'équipe LabFlow. Pour arrêter (résilier) son abonnement, le client prévient l'équipe LabFlow, à tout moment ; l'accès reste ouvert jusqu'à la fin du mois payé.$k198_abonnement_et_capacite$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = lower('Abonnement et capacité')
    AND md5(replace(contenu, E'\r', '')) = 'a4867777df1c4cc3c0aed2ef10b58e05';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN b_faites := b_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) = lower('Abonnement et capacité')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN b_deja := b_deja + 1;
  ELSE b_gardees := b_gardees || 'abonnement et capacité'::TEXT;
  END IF;
  -- ── variante : hotellerie / lexique ──
  t := $v198_hotellerie_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Ajout de capacité** | Demande faite depuis la page Demandes pour ajouter [[un:activite:pl]], [[un:labo:pl]] ou [[un:gerant:pl]], ou pour activer l'option [[Court:acheteur:pl]] ou en changer le palier. Dès que l'équipe LabFlow la valide, la capacité est ajoutée, sans document à signer. |
| **[[Court:appro]] (approvisionnement)** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro:court]] peut provenir d'un achat auprès d'[[un:fournisseur]], d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **Base [[court:acheteur:pl]]** | Option de l'abonnement, facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]]. Elle active [[le:espace_acheteurs:Nom]]. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. On l'appelle aussi l'option [[Court:acheteur:pl]]. |
| **Catégorie** | Deux notions distinctes : la *catégorie [[de:article:pl]]* ([[nom:referentiel]]) affine une famille (ex. « Jus de fruits » dans la famille « Petit-déjeuner ») ; la *catégorie [[de:produit:pl]]* ([[Nom:espace_produits]]) classe ce qui se vend (ex. « Cocktails ») et est typée vendable, [[nom:supplement]] ou valorisé. |
| **Charge** | Dépense d'exploitation hors matière première : énergie, blanchisserie, main-d'œuvre… Saisie dans [[le:espace_vente:Nom]], elle affine l'analyse de rentabilité au-delà [[acc:cout_matiere:du seul:de la seule]] [[nom:cout_matiere]]. |
| **[[Nom:acheteur]]** | Entreprise ou établissement (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : société voisine, organisateur de séminaires, autre hôtel du groupe… [[acc:acheteur:Il:Elle]] peut être [[acc:acheteur:invité:invitée]] sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et [[le:cout_matiere]] d'[[un:produit]]. Un club sandwich dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Commande [[compl:acheteur]]** | Commande passée en ligne par le client sur son portail, ou saisie directement en [[nom:vente]] [[acc:vente:manuel:manuelle]]. Elle suit quatre états : en attente → expédiée ([[le:stock]] [[du:labo]] est [[acc:stock:déduit:déduite]] et la facture émise) → livrée ; une commande peut être annulée, [[le:stock]] est alors [[acc:stock:réintégré:réintégrée]]. |
| **Composé valorisé** | [[Nom:pt]] [[acc:pt:fabriqué:fabriquée]] [[au:labo]] puis [[acc:pt:envoyé:envoyée]] par [[nom:transfert]] vers [[le:activite:pl]], où [[acc:pt:il:elle]] se vend [[acc:pt:tel quel:telle quelle]] (ex. un coffret de biscuits maison, revendu au minibar des chambres). Son prix de revient est figé au coût [[du:labo]] au moment de la production. |
| **Compte [[nom:depot]]** | Type de compte sans [[nom:activite]] : [[un:labo]] et la base [[court:acheteur:pl]]. [[Le:labo]] fabrique et vend directement aux professionnels — par exemple pour fournir les hôtels d'un groupe ou des entreprises voisines. |
| **[[Nom:produit_utilisable]]** | [[Nom:pt]] intermédiaire, non [[acc:pt:vendu:vendue]] [[acc:pt:tel quel:telle quelle]], [[acc:pt:réutilisé:réutilisée]] dans d'autres [[nom:recette:pl]] : sirop maison du bar, confiture du petit-déjeuner, granola… Son coût se répercute automatiquement dans [[tous:produit:les]] qui l'utilisent. |
| **[[Nom:labo]]** | Lieu de production et de stockage commun à [[votre:activite:pl]], rattaché au compte, qui regroupe par exemple la production des repas et l'économat. [[acc:labo:Il:Elle]] achète et fabrique en gros, alimente [[le:activite:pl]] par [[nom:transfert]] — et, si l'option [[Court:acheteur:pl]] est active, vend directement aux professionnels. Un compte peut avoir zéro, [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]. |
| **Domaine d'activité** | Secteur métier de votre compte (pour vous, l'hôtellerie). Il détermine le catalogue [[de:article:pl]] qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories [[de:article:pl]] (« Petit-déjeuner », « Hygiène et accueil »…) portant deux propriétés clés : *consommable* (nom de la colonne à l'écran : [[son:article:pl]] peuvent entrer dans [[le:recette:pl]] ; à ne pas confondre avec [[le:produit_utilisable:pl]]) et *vendable* ([[nom:vente]] en l'état). Ces propriétés déterminent où chaque [[nom:article]] peut être [[acc:article:utilisé:utilisée]]. |
| **[[Nom:recette]]** | Composition d'[[un:produit]] : [[nom:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]]. [[acc:recette:Il:Elle]] sert à la fois au calcul du coût de revient et à la déduction [[du:stock]]. |
| **[[Nom:fiche_technique]]** | Version chiffrée d'[[un:recette]] : liste [[un:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]], et calcul automatique du coût de revient matière. C'est l'outil central du chiffrage de ce que vendent [[votre:activite:pl]]. |
| **Formule d'activités** | Niveau d'abonnement de [[votre:activite:pl]]. *Activité Basique* : [[nom:stock]], [[nom:appro:pl]] et [[nom:vente:pl]] [[de:article:pl]] [[acc:article:valorisé:valorisée:pl]], sans [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]]. *Activité Premium* : tout LabFlow, y compris [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]] et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **[[Nom:fournisseur]]** | Tiers auprès duquel vous achetez vos marchandises : grossiste, torréfacteur, distributeur d'eaux minérales… Il est associé [[au:appro:pl]] et aux factures pour tracer l'origine de chaque achat. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (café, jus de fruits, eau minérale, savonnettes…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant ([[nom:stock]], [[nom:pt:pl]], rapports, tableaux de bord) est en TTC. |
| **[[Nom:inventaire]]** | Comptage physique [[du:stock]] à une date donnée. La quantité réelle saisie devient la nouvelle référence [[du:stock]] ; [[le:stock]] théorique [[acc:stock:affiché:affichée]] pendant la saisie permet de repérer les écarts. |
| **[[Nom:transfert]]** | Mouvement de marchandise [[du:labo]] vers [[un:activite]] : [[le:stock]] de départ diminue, [[acc:stock:celui:celle]] [[du:activite]] augmente. Ce mouvement se fait au coût [[du:labo]]. C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], [[un:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]]. |
| **[[Nom:marge]]** | Différence entre le prix de vente et [[le:cout_matiere]]. Un jus pressé vendu 8 DT avec 2 DT de matière dégage 6 DT [[de:marge]] [[acc:marge:brut:brute]]. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **[[Nom:perte]] (avarie / déchet)** | Marchandise sortie [[du:stock]] sans être vendue : *avarie* ([[nom:produit]] [[acc:produit:périmé:périmée]], [[acc:produit:abîmé:abîmée]], impropre) ou *déchet* (casse, restes du buffet, ratés de production). Chaque [[nom:perte]] est [[acc:perte:valorisé:valorisée]] en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'[[un:article]], pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser [[le:stock]] et [[le:transfert:pl]]. |
| **Portail [[court:acheteur]]** | Espace en ligne ouvert à chacun de vos clients B2B invités : il y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. Il ne voit jamais vos quantités en [[nom:stock]] ; le vendeur ajuste les quantités, ou retire des lignes, à l'expédition. |
| **[[Nom:pt]] ([[court:pt]])** | [[Nom:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : sa production déduit automatiquement [[le:ingredient:pl]] [[acc:ingredient:consommés:consommées]], y compris [[le:produit_utilisable:pl]] qu'[[acc:recette:il:elle]] contient. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **[[Nom:prestataire]]** | Canal de vente tiers (plateforme de livraison de repas…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration [[de:vente]]. |
| **[[Nom:produit_valorise]]** | [[Nom:produit]] [[acc:produit:vendu:vendue]] [[acc:produit:tel quel:telle quelle]], sans décomposition [[de:recette]] au moment [[du:vente]] : [[nom:article]] de revente (ex. eau minérale du minibar) ou [[nom:produit_compose]] [[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]. |
| **[[Nom:produit_vendable]]** | [[Nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:défini:définie]] par [[un:fiche_technique]] et [[acc:produit:vendu:vendue]] par [[un:activite]] : petit-déjeuner, cocktail, club sandwich, formule séminaire… [[acc:produit:Il:Elle]] est obligatoirement [[acc:produit:rattaché:rattachée]] à une catégorie [[de:produit]]. |
| **PV (prix de vente)** | Prix auquel [[un:produit]] est [[acc:produit:vendu:vendue]] au client. LabFlow distingue le prix direct ([[nom:vente]] sur place, à la clientèle de l'hôtel) et les prix propres à chaque [[nom:prestataire]]. |
| **[[Nom:food_cost]]** | Part [[du:cout_matiere]] (matières premières consommées) dans le prix de vente d'un petit-déjeuner, d'un cocktail ou d'un plateau. Un petit-déjeuner continental vendu 15 DT dont [[le:ingredient:pl]] coûtent 4,500 DT a [[un:food_cost]] de 30 %. |
| **[[Nom:referentiel]]** | Socle de données du compte : unités, familles, catégories et [[nom:article:pl]]. Tout le reste ([[nom:stock]], [[nom:recette:pl]], [[nom:vente:pl]]) s'appuie dessus. |
| **[[Nom:gerant]]** | Utilisateur délégué par le propriétaire du compte, par exemple la gouvernante générale ou le responsable du bar. Son accès est limité [[au:activite:pl]] et [[au:labo:pl]] qui lui sont affectés. |
| **[[Nom:activite]]** | Département de l'hôtel exploité par votre compte : restaurant, bar, spa, housekeeping… Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **Seuil d'alerte** | Quantité minimale définie pour [[un:article]] ou [[un:pt]] : lorsque [[le:stock]] passe en dessous, la ligne est signalée pour réapprovisionnement. Pour [[le:pt:pl]], le seuil se règle par [[nom:activite]]. |
| **[[Nom:stock]] théorique** | Quantité calculée par l'application : [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] + [[nom:appro:pl]] − [[nom:perte:pl]] − [[nom:transfert:pl]] [[acc:transfert:sortant:sortante:pl]] − consommations ([[nom:vente:pl]], productions). [[Le:inventaire]] [[acc:stock:le:la]] réconcilie avec [[le:stock]] [[acc:stock:réel:réelle]] [[acc:stock:compté:comptée]]. |
| **[[Nom:supplement]]** | [[Nom:produit_vendable]] complémentaire [[acc:produit_vendable:proposé:proposée]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] : jus pressé ajouté au petit-déjeuner, sirop dans un café, extra… [[acc:produit_vendable:Il:Elle]] a [[acc:fiche_technique:son propre:sa propre]] [[nom:fiche_technique]] et son propre prix de vente. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture [[de:vente]] [[au:acheteur:pl]] (montant fixe en DT, désactivable [[au:vente]]). |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit [[au:appro]], [[nom:article]] par [[nom:article]], et sert au calcul des prix TTC. |
| **Unité** | Mesure dans laquelle se compte [[un:article]] : kg, litre, gramme, pièce, bouteille… Utilisez la même unité à l'achat et en [[nom:recette]] pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur [[du:stock]], d'[[un:perte]] ou d'une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût [[de:recette]]). |

### Voir aussi

- [Les 3 catégories [[de:pt:pl]]](#lexique-pt) — le détail [[un:pt:pl:court]] utilisables, vendables et [[acc:pt:composés valorisés:composées valorisées]]
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels de A à Z
- [Un compte, [[un:activite:pl]], [[un:labo:pl]]](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'[[un:recette]]](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$v198_hotellerie_lexique$;
  UPDATE manuel_sections_domaine d SET
    contenu = t,
    base_md5 = 'f8cb03f85a63d72f0e3ff70431725b28'
  FROM manuel_sections s
  WHERE s.id = d.section_id AND s.slug = 'lexique' AND d.domaine_slug = 'hotellerie'
    AND d.statut = 'brouillon'
    AND md5(replace(d.contenu, E'\r', '')) = 'cf9c25e3c96e508213af66675d7a2307'
    AND md5(replace(s.contenu, E'\r', '')) = 'f8cb03f85a63d72f0e3ff70431725b28';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_faites := v_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id
                 WHERE s.slug = 'lexique' AND d.domaine_slug = 'hotellerie'
                   AND md5(replace(d.contenu, E'\r', '')) = md5(t)) THEN v_deja := v_deja + 1;
  ELSE v_gardees := v_gardees || 'hotellerie/lexique'::TEXT;
  END IF;
  -- ── variante : hotellerie / onboarding-configuration ──
  t := $v198_hotellerie_onboarding_configuration$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **[[Mon:activite:pl]]** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez [[votre:activite]] » rappelant ce que votre abonnement inclut (nombre [[de:activite:pl]] et [[de:labo:pl]]), avec le bouton **✨ Créer mon business** si votre abonnement inclut [[un:labo]], ou **+ Ajouter [[mon:activite]]** sinon — pour un **compte [[nom:depot]]**, sans [[nom:activite]], la carte devient « Démarrez [[votre:labo]] » avec le bouton **🏭 Créer [[mon:labo]]** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 [[nom:activite:pl]]) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez [[votre:labo]] et [[votre:activite:pl]].** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord [[det:labo_long:le]]**[[Nom:labo_long]]** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis [[det:activite:votre:pl]]**[[Nom:activite:pl]]** (nom, adresse et, si vous en créez [[acc:labo:un:une]], le choix « Avec [[nom:labo]] » ou « Sans [[nom:labo]] » pour [[acc:activite:chacun:chacune]]). Ajoutez autant [[de:activite:pl]] (restaurant, bar, spa, housekeeping…) que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez [[votre:referentiel]].** Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]], [[le:referentiel:Nom]] se déverrouille dans le menu : créez vos unités, familles et catégories, puis [[votre:article:pl]] (nom, unité, catégorie) — denrées, vins et spiritueux, savons et gels douche…
3. **Affectez [[votre:article:pl]].** Sélectionnez, pour chaque [[nom:activite]] et pour [[le:labo]], [[le:article:pl]] qui y sont [[acc:article:utilisé:utilisée:pl]] : les spiritueux au bar, les gels douche au housekeeping. Les espaces [[Pl:activite]] et [[Court:labo]] se déverrouillent dès qu'[[un:article]] leur est [[acc:article:affecté:affectée]] ; l'Espace [[Nom:produit:pl]] s'ouvre dès [[acc:article:votre premier:votre première]] [[nom:article]] [[acc:article:créé:créée]].
4. **Saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].** Rendez-vous dans [[le:stock]] pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de [[votre:stock]] commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de [[votre:activite:pl]] et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte [[nom:depot]]** (sans [[nom:activite]], avec la base [[court:acheteur:pl]]) : l'assistant se résume à la création [[du:labo]]. Constituez ensuite [[le:referentiel]], affectez [[votre:article:pl]] [[au:labo]], puis configurez [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module) : [[nom:article:pl]] commandables, carnet [[de:acheteur:pl]] et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles ([[nom:activite:pl]] [[acc:activite:créé:créée:pl]], [[nom:article:pl]] [[acc:article:affecté:affectée:pl]]) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Faire évoluer votre abonnement](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$v198_hotellerie_onboarding_configuration$;
  UPDATE manuel_sections_domaine d SET
    contenu = t,
    base_md5 = 'a7d78a7979106b1cd0ed7451cfb11c1e'
  FROM manuel_sections s
  WHERE s.id = d.section_id AND s.slug = 'onboarding-configuration' AND d.domaine_slug = 'hotellerie'
    AND d.statut = 'brouillon'
    AND md5(replace(d.contenu, E'\r', '')) = '7d293580a805c569505a95bb4cd4e4d7'
    AND md5(replace(s.contenu, E'\r', '')) = 'a7d78a7979106b1cd0ed7451cfb11c1e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_faites := v_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id
                 WHERE s.slug = 'onboarding-configuration' AND d.domaine_slug = 'hotellerie'
                   AND md5(replace(d.contenu, E'\r', '')) = md5(t)) THEN v_deja := v_deja + 1;
  ELSE v_gardees := v_gardees || 'hotellerie/onboarding-configuration'::TEXT;
  END IF;
  -- ── variante : usine / lexique ──
  t := $v198_usine_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Ajout de capacité** | Demande faite depuis la page Demandes pour ajouter [[un:activite:pl]], [[un:labo:pl]] ou [[un:gerant:pl]], ou pour activer la base [[court:acheteur:pl]] ou en changer le palier. Dès que l'équipe LabFlow la valide, la capacité est ajoutée, sans document à signer. |
| **Base [[court:acheteur:pl]]** | Extension de l'abonnement qui active [[le:espace_acheteurs:Nom]]. Elle est facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]]. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. |
| **Catégorie** | Deux notions distinctes : la *catégorie [[de:article:pl]]* ([[nom:referentiel]]) affine une famille (ex. « Oxydes colorants » dans la famille « Émaux et décors ») ; la *catégorie [[de:produit:pl]]* ([[Nom:espace_produits]]) classe ce qui se vend (ex. « Arts de la table ») et est typée vendable, [[nom:supplement]] ou valorisé. |
| **Charge** | Dépense d'exploitation hors [[nom:article]] : énergie des fours, emballages, main-d'œuvre… Saisie dans [[le:espace_vente:Nom]], elle affine l'analyse de rentabilité au-delà [[acc:cout_matiere:du seul:de la seule]] [[nom:cout_matiere]]. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et [[le:cout_matiere]] d'[[un:produit]]. Un vase dont la matière coûte 4 DT et qui est vendu 12 DT a un coefficient de 3. |
| **Commande [[compl:acheteur]]** | Demande d'achat passée par [[un:acheteur]] depuis son portail, ou saisie directement en [[nom:vente]] [[acc:vente:manuel:manuelle]]. Elle suit quatre états : en attente → expédiée ([[le:stock]] [[du:labo]] est [[acc:stock:déduit:déduite]] et la facture émise) → livrée ; une commande peut être annulée, [[le:stock]] est alors [[acc:stock:réintégré:réintégrée]]. |
| **Composé valorisé** | [[Nom:pt]] [[acc:pt:réalisé:réalisée]] [[au:labo]] puis [[acc:pt:envoyé:envoyée]] par [[nom:transfert]] vers [[le:activite:pl]], où [[acc:pt:il:elle]] se vend [[acc:pt:tel quel:telle quelle]] (ex. un coffret de six tasses, revendu en showroom). Son prix de revient est figé au coût [[du:labo]] au moment de la production. |
| **Compte [[nom:depot]]** | Type de compte sans [[nom:activite]] : [[un:labo]] et la base [[court:acheteur:pl]]. [[Le:labo]] fabrique et vend directement aux professionnels — c'est le modèle de l'usine qui vend en gros, sans showroom. |
| **Domaine d'activité** | Secteur métier de votre compte (pour vous, l'industrie). Il détermine le catalogue [[de:article:pl]] qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories [[de:article:pl]] (« Argiles », « Émaux et décors »…) portant deux propriétés clés : *consommable* (utilisé en fabrication) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque [[nom:article]] peut être [[acc:article:utilisé:utilisée]]. |
| **[[Nom:fiche_technique]]** | [[Nom:recette]] [[acc:recette:chiffré:chiffrée]] d'[[un:produit]] : liste [[un:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]], et calcul automatique [[du:cout_matiere]]. C'est l'outil central du chiffrage de votre catalogue. |
| **Formule d'activités** | Niveau d'abonnement de [[votre:activite:pl]]. *Activité Basique* : [[nom:stock]], [[nom:appro:pl]] et [[nom:vente:pl]] de marchandises revendues telles quelles, sans [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]]. *Activité Premium* : tout LabFlow, y compris [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]] et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **[[Nom:fournisseur]]** | Tiers auprès duquel vous achetez vos marchandises : argile, émaux, emballages… Il est associé [[au:appro:pl]] et aux factures pour tracer l'origine de chaque achat. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant ([[nom:stock]], [[nom:pt:pl]], rapports, tableaux de bord) est en TTC. |
| **[[Nom:prestataire]]** | Canal de vente tiers (marketplace en ligne, centrale d'achat…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration [[de:vente]]. |
| **[[Nom:inventaire]]** | Comptage physique [[du:stock]] à une date donnée (pièces en rayon, palettes de carreaux, sacs d'argile…). La quantité réelle saisie devient la nouvelle référence [[du:stock]] ; [[le:stock]] théorique [[acc:stock:affiché:affichée]] pendant la saisie permet de repérer les écarts. |
| **[[Nom:transfert]]** | Mouvement de marchandise [[du:labo]] vers [[un:activite]] (de l'usine au showroom, par exemple) : [[le:stock]] de départ diminue, [[acc:stock:celui:celle]] d'arrivée augmente, au coût [[du:labo]]. C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], [[un:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]]. |
| **[[Nom:marge]]** | Différence entre le prix de vente et [[le:cout_matiere]]. Un bol vendu 8 DT avec 2 DT de matière dégage 6 DT [[de:marge]] [[acc:marge:brut:brute]]. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (argile, kaolin, fritte, oxydes colorants…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **[[Nom:recette]]** | Composition d'[[un:produit]] : [[nom:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]] (ex. l'argile, l'engobe et l'émail d'une assiette). Elle sert à la fois au calcul du coût de revient et à la déduction [[du:stock]]. |
| **[[Nom:supplement]]** | [[Nom:produit_vendable]] complémentaire [[acc:produit_vendable:proposé:proposée]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] : personnalisation (prénom, logo), décor peint à la main, coffret cadeau… [[acc:produit_vendable:Il:Elle]] a [[acc:fiche_technique:son propre:sa propre]] [[nom:fiche_technique]] et son propre prix de vente. |
| **[[Nom:perte]] (avarie / déchet)** | Marchandise sortie [[du:stock]] sans être vendue : *avarie* ([[nom:produit]] [[acc:produit:fêlé:fêlée]], [[acc:produit:ébréché:ébréchée]] ou présentant un défaut d'émail) ou *déchet* (casse, rebuts de cuisson, chutes d'argile). Chaque [[nom:perte]] est [[acc:perte:valorisé:valorisée]] en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'[[un:article]], pondéré par les quantités achetées. 1 000 kg d'argile achetés à 0,400 DT puis 500 kg à 0,550 DT donnent un PMP de 0,450 DT/kg ; il sert à valoriser [[le:stock]] et [[le:transfert:pl]]. |
| **[[Nom:activite]]** | Showroom, boutique, atelier-boutique ou magasin d'usine exploité par votre compte. Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **Portail [[court:acheteur]]** | Espace en ligne dédié à chaque [[nom:acheteur]] [[acc:acheteur:invité:invitée]] : [[acc:acheteur:il:elle]] y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. [[acc:acheteur:Il:Elle]] ne voit jamais vos quantités en [[nom:stock]] ; le vendeur ajuste les quantités, ou retire des lignes, à l'expédition. |
| **[[Nom:pt]]** | Pièce ou préparation réalisée à partir d'[[un:recette]] et suivie en [[nom:stock]] : sa production déduit automatiquement [[le:ingredient:pl]] et [[le:produit_utilisable:pl]] consommés. Trois catégories existent : [[nom:produit_utilisable:pl]], [[nom:produit_vendable:pl]] et composés valorisés. |
| **[[Nom:produit_vendable]]** | Pièce terminée, définie par [[un:fiche_technique]] et vendue par [[un:activite]] : assiette, bol, vase, carreau émaillé… [[acc:produit_vendable:Il:Elle]] est obligatoirement [[acc:produit_vendable:rattaché:rattachée]] à une catégorie [[de:produit]]. |
| **[[Nom:produit_valorise]]** | Élément vendu tel quel, sans décomposition [[de:recette]] au moment [[du:vente]] : marchandise achetée pour être revendue (ex. bougie parfumée, linge de table) ou [[nom:produit_compose]] [[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]] (ex. coffret de six tasses). |
| **PV (prix de vente)** | Prix auquel [[un:produit]] est [[acc:produit:vendu:vendue]] au client. LabFlow distingue le prix direct ([[nom:vente]] en showroom) et les prix propres à chaque [[nom:prestataire]]. |
| **[[Nom:appro]]** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro]] peut provenir d'un achat auprès d'[[un:fournisseur]] (un arrivage d'argile, par exemple), d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **[[Nom:referentiel]]** | Socle de données du compte : unités, familles, catégories et [[nom:article:pl]]. Tout le reste ([[nom:stock]], [[nom:recette:pl]], [[nom:vente:pl]]) s'appuie dessus. |
| **[[Nom:gerant]]** | Utilisateur délégué par le propriétaire du compte (par exemple, la personne qui dirige un atelier ou un showroom). Son accès est limité [[au:activite:pl]] et [[au:labo:pl]] qui lui sont affectés. |
| **[[Nom:acheteur]]** | Client professionnel (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : magasin de décoration, négociant en carrelage, concept-store… Il peut être invité sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **[[Nom:produit_utilisable]]** | [[Nom:pt]] qui n'est jamais [[acc:pt:vendu:vendue]] [[acc:pt:tel quel:telle quelle]] mais [[acc:pt:réutilisé:réutilisée]] dans d'autres [[nom:recette:pl]] : barbotine, émail préparé, engobe, pièce crue ou biscuit… Son coût se répercute automatiquement dans [[tous:produit:les]] qui l'utilisent. |
| **Seuil d'alerte** | Quantité minimale définie pour [[un:article]] ou [[un:pt]] (ex. 500 kg d'argile) : lorsque [[le:stock]] passe en dessous, la ligne est signalée pour réapprovisionnement. Pour [[le:pt:pl]], le seuil se règle par [[nom:activite]]. |
| **[[Nom:labo]]** | Usine ou atelier de fabrication rattaché au compte. [[acc:labo:Il:Elle]] achète et fabrique en gros, alimente [[le:activite:pl]] par [[nom:transfert]] — et, si la base [[court:acheteur:pl]] est active, vend directement aux professionnels. Un compte peut avoir zéro, [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]. |
| **[[Nom:stock]] théorique** | Quantité calculée par l'application : [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] + [[nom:appro:pl]] − [[nom:perte:pl]] − [[nom:transfert:pl]] [[acc:transfert:sortant:sortante:pl]] − consommations ([[nom:vente:pl]], productions). [[Le:inventaire]] [[acc:stock:le:la]] réconcilie avec [[le:stock]] [[acc:stock:réel:réelle]] [[acc:stock:compté:comptée]]. |
| **[[Nom:food_cost]]** | Ce que coûtent [[le:article:pl]] [[acc:article:consommé:consommée:pl]] pour produire une pièce, le plus souvent rapporté à son prix de vente. Un vase vendu 15 DT dont [[le:ingredient:pl]] coûtent 4,500 DT a [[un:food_cost]] de 30 %. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture [[de:vente]] [[au:acheteur:pl]] (montant fixe en DT, désactivable [[au:vente]]). |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit [[au:appro]], pour chaque [[nom:article]], et sert au calcul des prix TTC. |
| **Unité** | Mesure dans laquelle on compte [[un:article]] : kg, litre, pièce, m²… Utilisez la même unité à l'achat et en [[nom:recette]] pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur [[du:stock]], d'[[un:perte]] ou d'une production (une fournée de bols, par exemple), obtenue en multipliant la quantité par le prix unitaire (PMP ou coût [[de:recette]]). |

### Voir aussi

- [Les 3 catégories [[de:pt:pl]]](#lexique-pt) — [[le:produit_utilisable:pl]], [[le:produit_vendable:pl]] et les composés valorisés en détail
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels de A à Z
- [Un compte, [[un:activite:pl]], [[un:labo:pl]]](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'[[un:recette]]](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$v198_usine_lexique$;
  UPDATE manuel_sections_domaine d SET
    contenu = t,
    base_md5 = 'f8cb03f85a63d72f0e3ff70431725b28'
  FROM manuel_sections s
  WHERE s.id = d.section_id AND s.slug = 'lexique' AND d.domaine_slug = 'usine'
    AND d.statut = 'brouillon'
    AND md5(replace(d.contenu, E'\r', '')) = '0e34b51bd151addfce726937011ca1c2'
    AND md5(replace(s.contenu, E'\r', '')) = 'f8cb03f85a63d72f0e3ff70431725b28';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_faites := v_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id
                 WHERE s.slug = 'lexique' AND d.domaine_slug = 'usine'
                   AND md5(replace(d.contenu, E'\r', '')) = md5(t)) THEN v_deja := v_deja + 1;
  ELSE v_gardees := v_gardees || 'usine/lexique'::TEXT;
  END IF;
  -- ── variante : usine / onboarding-configuration ──
  t := $v198_usine_onboarding_configuration$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **[[Mon:activite:pl]]** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, un encadré de bienvenue « Démarrez [[votre:activite]] » rappelant ce que votre abonnement inclut (nombre [[de:activite:pl]] et [[de:labo:pl]]), avec le bouton **✨ Créer mon business** si votre abonnement inclut [[un:labo]], ou **+ Ajouter [[mon:activite]]** sinon — pour un **compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]), l'encadré devient « Démarrez [[votre:labo]] » avec le bouton **🏭 Créer [[mon:labo]]** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 [[nom:activite:pl]]) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez [[votre:labo]] et [[votre:activite:pl]].** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord [[det:labo_long:le]]**[[Nom:labo_long]]** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis [[det:activite:votre:pl]]**[[Nom:activite:pl]]** (nom, adresse et, si vous créez [[un:labo]], le choix « Avec [[nom:labo]] » ou « Sans [[nom:labo]] » pour [[acc:activite:chacun:chacune]]). Ajoutez autant [[de:activite:pl]] que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez [[votre:referentiel]].** Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]], [[le:referentiel:Nom]] se déverrouille dans le menu : créez vos unités, familles et catégories, puis [[votre:article:pl]] (nom, unité, catégorie : l'argile en kg, par exemple).
3. **Affectez [[votre:article:pl]].** Sélectionnez, pour chaque [[nom:activite]] et pour [[le:labo]], [[le:article:pl]] qui y sont [[acc:article:utilisé:utilisée:pl]]. Les espaces [[Pl:activite]] et [[Court:labo]] se déverrouillent dès qu'[[un:article]] leur est [[acc:article:affecté:affectée]]. L'Espace [[Nom:produit:pl]] s'ouvre dès [[acc:article:votre premier:votre première]] [[nom:article]] [[acc:article:créé:créée]].
4. **Saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].** Rendez-vous dans [[le:stock]] pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de [[votre:stock]] commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de [[votre:activite:pl]] et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]) : l'assistant se résume à la création [[du:labo]]. Constituez ensuite [[le:referentiel]] et affectez [[votre:article:pl]] [[au:labo]]. Configurez enfin [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module) : [[nom:article:pl]] commandables, carnet [[de:acheteur:pl]] et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles ([[nom:activite:pl]] [[acc:activite:créé:créée:pl]], [[nom:article:pl]] [[acc:article:affecté:affectée:pl]]) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Faire évoluer votre abonnement](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$v198_usine_onboarding_configuration$;
  UPDATE manuel_sections_domaine d SET
    contenu = t,
    base_md5 = 'a7d78a7979106b1cd0ed7451cfb11c1e'
  FROM manuel_sections s
  WHERE s.id = d.section_id AND s.slug = 'onboarding-configuration' AND d.domaine_slug = 'usine'
    AND d.statut = 'brouillon'
    AND md5(replace(d.contenu, E'\r', '')) = '0b3c77015921d1f61d16bc9d7bde7700'
    AND md5(replace(s.contenu, E'\r', '')) = 'a7d78a7979106b1cd0ed7451cfb11c1e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_faites := v_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id
                 WHERE s.slug = 'onboarding-configuration' AND d.domaine_slug = 'usine'
                   AND md5(replace(d.contenu, E'\r', '')) = md5(t)) THEN v_deja := v_deja + 1;
  ELSE v_gardees := v_gardees || 'usine/onboarding-configuration'::TEXT;
  END IF;
  RAISE NOTICE '198 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m198$;
