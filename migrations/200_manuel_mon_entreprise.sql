-- 200 — Lot 3, étape 9 : section « Mon entreprise » de la fiche Mon compte (identité légale, factures figées) ; factures de vente citées par la FAQ et par l'entrée « Timbre fiscal ».
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["compte","faq"],"titres":[],"entrees":["timbre fiscal"],"variantes":[]}

DO $m200$
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
  -- ── compte ──
  t := $m200_compte$## 👤 Mon compte

Cet écran regroupe vos informations personnelles et la sécurité de votre accès. Vous y accédez par l'entrée **Mon profil**, en bas du menu latéral. Propriétaire ou [[nom:gerant]], chacun gère ici son propre profil.

### Ce que vous voyez

- Un bandeau d'en-tête avec vos initiales, votre nom et votre adresse e-mail.
- La carte **Informations personnelles** : nom (obligatoire), e-mail (obligatoire) et téléphone.
- La carte **Sécurité — Changer le mot de passe** : mot de passe actuel, nouveau mot de passe et confirmation.
- Le bouton **Enregistrer les modifications**, qui valide ces deux cartes en une fois.
- Pour le propriétaire du compte, au bas de la page : la carte **Mon entreprise**, avec son propre bouton (voir plus bas).

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

### Mon entreprise

Réservée au propriétaire du compte ([[le:gerant:pl]] ne la voient pas), cette carte porte l'identité de votre entreprise ; vos factures [[de:vente]] et d'abonnement en reprennent les mentions légales.

- **Raison sociale** (ou nom du titulaire), **forme juridique**, **matricule fiscal**, et s'il y a lieu **nom commercial** et **identifiant RNE** : renseignés par l'équipe LabFlow d'après votre patente, en lecture seule. Une erreur ? Prévenez l'équipe LabFlow.
- **Adresse**, **ville**, **représentant légal** et sa **fonction** : vous les saisissez vous-même, puis cliquez sur **Enregistrer mon entreprise**.

:::regle
Une facture [[de:vente]] ou d'abonnement garde l'identité de votre entreprise du jour de son émission (pour l'abonnement : quand la mensualité passe à « Payé ») : une modification ne vaut que pour les factures suivantes. Les factures plus anciennes que cette règle (5 octobre 2026) et les factures [[de:appro]] reprennent, elles, vos informations du moment ; l'écran vous prévient quand un changement d'adresse touche d'anciennes factures [[de:vente]].
:::

:::attention
Tant que la raison sociale, le matricule fiscal, l'adresse ou la ville manquent, un bandeau le signale ici et sur les pages [[du:espace_acheteurs:Nom]] : une facture émise entre-temps restera sans toutes ses mentions légales.
:::

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
- [Demandes et support](#support) — contacter l'assistance$m200_compte$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'compte'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '548544cb7ebd2701d4e80190a4c510ad';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'compte'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'compte'::TEXT; END IF;
  -- ── faq ──
  t := $m200_faq$## ❓ Questions fréquentes

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

Les **factures [[de:appro]]** se trouvent dans l'écran [Factures](#factures) de chaque [[nom:activite]] ou [[nom:labo]] : elles sont générées à la validation et re-téléchargeables à tout moment. Les **factures [[de:vente]]** s'ouvrent par le bouton **Facture** de chaque commande (voir [[[Pl:vente]] & commandes](#acheteurs-ventes)) ; avec un compte portail, [[votre:acheteur:pl]] les retrouvent aussi. Les **paiements d'abonnement** se consultent dans l'[historique des paiements](#historique-paiements).

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

Depuis l'écran [[de:stock]] [[du:activite]] ([[[Nom:stock]] [[du:activite:pl]]](#stock-activites)) ou [[du:labo]] ([[[Nom:stock]] [[du:labo]]](#stock-labo)) : l'action **Enregistrer [[un:perte]]** sur la ligne [[du:article]] ou [[du:produit]] vous demande la quantité, le type [[de:perte]] (avarie ou déchet) et la date. [[Le:perte]] est [[acc:perte:déduit:déduite]] [[du:stock]] et [[acc:perte:valorisé:valorisée]] en TTC dans vos rapports — détail dans [[[Nom:perte:pl]]](#pertes).$m200_faq$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'faq'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '2671d371a67a970b43ac199953076878';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'faq'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'faq' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'faq'::TEXT; END IF;
  -- ── base : timbre fiscal ──
  t := $k200_timbre_fiscal$Le timbre fiscal est une taxe fixe (1 DT en Tunisie) ajoutée au montant TTC d'une facture lorsqu'il s'applique. Il est suivi par LabFlow sur les factures [[de:appro]] et sur les factures [[de:vente]].$k200_timbre_fiscal$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = lower('Timbre fiscal')
    AND md5(replace(contenu, E'\r', '')) = '053930e5e30882cb6c5d39aaee0aecf1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN b_faites := b_faites + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) = lower('Timbre fiscal')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN b_deja := b_deja + 1;
  ELSE b_gardees := b_gardees || 'timbre fiscal'::TEXT;
  END IF;
  RAISE NOTICE '200 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m200$;
