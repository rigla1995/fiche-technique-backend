-- LabFlow Compta, étape S3b « Le comptable du client » (labflow-reprise/achats-compta/PLAN-S3b.md ; SPEC-SOCLE D2, D4,
-- D14, D16).
-- 1) Demande d'ajout de gérants comptables par un client qui a le module (SPEC-SOCLE §3.1) : la validation par l'équipe
--    LabFlow augmente abonnement_config.nb_gerants_compta (facturé à partir du mois suivant, comme toute capacité).
ALTER TABLE support_demandes ADD COLUMN IF NOT EXISTS nb_gerants_compta_supp INTEGER NOT NULL DEFAULT 0;
DO $c205$
BEGIN
  ALTER TABLE support_demandes
    ADD CONSTRAINT support_demandes_nb_gerants_compta_supp_check CHECK (nb_gerants_compta_supp BETWEEN 0 AND 50);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$c205$;

-- 2) Date à laquelle la personne a reçu l'accès (page « Comptabilité de … » du comptable : « confiée le »). Les accès
--    déjà attribués (titulaires) reprennent leur date de création.
ALTER TABLE compta.acces ADD COLUMN IF NOT EXISTS attribue_le TIMESTAMPTZ;
UPDATE compta.acces SET attribue_le = created_at WHERE attribue_le IS NULL AND personne_id IS NOT NULL;

-- 3) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui des migrations 201 à 204 (garde md5 du texte par défaut, sans \r) ; le texte servi suit
--    seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f205a$## 📒 Bienvenue dans LabFlow Compta

LabFlow Compta est l'espace comptable de LabFlow. Il a sa propre adresse : **compta.labflow-tn.com**.

### Se connecter

1. Ouvrez **compta.labflow-tn.com**.
2. Saisissez votre adresse email et votre mot de passe, puis cliquez sur **Se connecter**.
3. Mot de passe perdu : cliquez sur **Mot de passe oublié ?**. Le lien reçu par email vous ramène sur LabFlow Compta.

### Passer de LabFlow à LabFlow Compta

Si vous utilisez aussi LabFlow (Stock / Vente), un écran vous propose, après la connexion, **Stock / Vente** ou **Comptabilité**. Ensuite, le bouton **📒 Comptabilité** de la barre du haut de LabFlow et le bouton **📦 Stock / Vente** de la barre du haut de LabFlow Compta font passer d'un espace à l'autre sans ressaisir votre mot de passe.

### Vos comptabilités

L'accueil **Vos comptabilités** présente les comptabilités auxquelles vous avez accès, en trois groupes toujours séparés :

| Groupe | Ce qu'il contient |
|---|---|
| Mon cabinet | la comptabilité de votre cabinet comptable |
| Ma comptabilité | la comptabilité de votre entreprise, quand vous êtes client LabFlow avec le module Comptabilité |
| Comptabilités confiées par des clients LabFlow | les comptabilités que des clients LabFlow vous ont confiées |

Tant qu'aucune comptabilité n'est ouverte pour votre compte, l'accueil l'indique.

### Une comptabilité vous est confiée

Un client LabFlow peut vous désigner comme son comptable, avec votre adresse email :

- **Vous n'avez pas encore de compte** : vous recevez une invitation par email. Cliquez sur **Activer mon compte** et choisissez votre mot de passe : le lien est valable 48 heures.
- **Vous avez déjà un compte LabFlow ou LabFlow Compta** : l'accès s'ajoute aux vôtres, avec la même adresse et le même mot de passe ; un email vous prévient.

La comptabilité apparaît alors dans le groupe **Comptabilités confiées par des clients LabFlow**. Sa carte ouvre la page **Comptabilité de …**, où vous pouvez aussi quitter cet accès.

### Aide

Le bouton **?** en haut de chaque page ouvre ce manuel dans un nouvel onglet, à la fiche de la page.$f205a$, 'compta-bienvenue', '2708424ef9bd7692e5217d06bced9474'),
($f205b$## 📒 Ma comptabilité

Cette page présente la comptabilité de votre entreprise dans LabFlow Compta. Elle existe dès que le **module Comptabilité** est activé sur votre compte LabFlow. Vous la trouvez dans le menu de gauche, entrée **Ma comptabilité**, ou depuis l'accueil.

### Ce que vous voyez

- **Votre module** : le prix mensuel du module (et des gérants comptables supplémentaires s'il y en a) et le mois à partir duquel il est facturé, avec votre abonnement LabFlow, sur la même facture.
- **Votre comptable** : le module comprend l'accès d'un comptable. Tant que vous ne l'avez pas désigné, il apparaît « À désigner » ; ensuite, vous voyez son nom, son adresse, son niveau et « Invitation envoyée » tant qu'il n'a pas activé son compte.
- **Gérants comptables supplémentaires** : les autres accès comptables, dans la limite achetée.

### Actions pas à pas

1. **Activer le module** : dans LabFlow, page **Mon abonnement**, carte **Module Comptabilité**, cliquez sur **Demander l'activation** ; l'équipe LabFlow valide votre demande.
2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.
3. **Désigner votre comptable** : cliquez sur **Gérer sur LabFlow**. La page **Gérants** de LabFlow s'ouvre, partie **Gérants Comptabilité** : indiquez son nom, son adresse email et son niveau.

### Les niveaux

| Niveau | Ce que la personne pourra faire |
|---|---|
| Consultation | tout lire, sans rien écrire |
| Saisie | saisir les pièces et les écritures, sans valider, clôturer ni configurer |
| Complet | tout, y compris valider, clôturer et configurer le dossier |

Les niveaux prendront effet avec les dossiers et la saisie.

### Points d'attention

:::attention
Le module est facturé à son prix, à partir du mois qui suit son activation. Les promotions de votre abonnement LabFlow ne s'y appliquent pas.
:::

:::astuce
L'ouverture de vos dossiers arrive dans une prochaine version de LabFlow Compta.
:::$f205b$, 'compta-ma-comptabilite', '3a1aa989fe48c069fd8166619240b1b3')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : la page d'une comptabilité confiée (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-confiee', 'Comptabilité confiée', '🤝', 1040, $f205c$## 🤝 Comptabilité confiée

Cette page présente une comptabilité qu'un client LabFlow vous a confiée. Vous l'ouvrez depuis l'accueil, groupe **Comptabilités confiées par des clients LabFlow**.

### Ce que vous voyez

- **Le client** : son identité (raison sociale, forme juridique, matricule fiscal, adresse) et son contact (nom, adresse email, téléphone).
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet) et la date à laquelle la comptabilité vous a été confiée.
- **Les dossiers** : ils arriveront dans une prochaine version de LabFlow Compta.

### Actions pas à pas

1. **Quitter cet accès** : cliquez sur **Quitter cet accès**, puis confirmez. La comptabilité disparaît de votre accueil et le client en est prévenu.

### Points d'attention

:::attention
Une comptabilité confiée suit l'abonnement de son client : si cet abonnement est suspendu, la page l'indique et la comptabilité n'est plus modifiable.
:::

:::astuce
Seul le client peut vous redonner un accès que vous avez quitté.
:::$f205c$, 'comptabilité confiée, client, quitter, accès, niveau, comptable', '/confiee')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
