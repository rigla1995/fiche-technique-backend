-- LabFlow Compta, étape S3c « Les gérants du cabinet » (labflow-reprise/achats-compta/PLAN-S3c.md ; SPEC-SOCLE D2, D14,
-- D15). Manuel de LabFlow Compta seulement (vocabulaire comptable fixe, jamais balisé) : aucune table ne change — les
-- gérants du cabinet sont des accès (compta.acces, migration 202 : état « desactive » déjà prévu) et leur demande
-- d'ajout réutilise support_demandes.nb_gerants_compta_supp (migration 205).
-- 1) Fiches existantes : texte remplacé seulement s'il est encore celui des migrations 202 et 205 (garde md5 du texte par
--    défaut, sans \r) ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage,
--    la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f207a$## 📒 Bienvenue dans LabFlow Compta

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
| Mon cabinet | votre cabinet comptable, ou le cabinet dont vous êtes collaborateur |
| Ma comptabilité | la comptabilité de votre entreprise, quand vous êtes client LabFlow avec le module Comptabilité |
| Comptabilités confiées par des clients LabFlow | les comptabilités que des clients LabFlow vous ont confiées |

Tant qu'aucune comptabilité n'est ouverte pour votre compte, l'accueil l'indique.

### Une comptabilité vous est confiée

Un client LabFlow peut vous désigner comme son comptable, avec votre adresse email :

- **Vous n'avez pas encore de compte** : vous recevez une invitation par email. Cliquez sur **Activer mon compte** et choisissez votre mot de passe : le lien est valable 48 heures.
- **Vous avez déjà un compte LabFlow ou LabFlow Compta** : l'accès s'ajoute aux vôtres, avec la même adresse et le même mot de passe ; un email vous prévient.

La comptabilité apparaît alors dans le groupe **Comptabilités confiées par des clients LabFlow**. Sa carte ouvre la page **Comptabilité de …**, où vous pouvez aussi quitter cet accès.

### Un cabinet vous ouvre un accès

Le titulaire d'un cabinet peut faire de vous l'un de ses gérants (collaborateurs), avec votre adresse email :

- **Vous n'avez pas encore de compte** : vous recevez une invitation par email. Cliquez sur **Activer mon compte** et choisissez votre mot de passe : le lien est valable 48 heures.
- **Vous avez déjà un compte LabFlow ou LabFlow Compta** : l'accès s'ajoute aux vôtres ; un email vous prévient.

Le cabinet apparaît alors dans le groupe **Mon cabinet**, avec votre niveau. Sa carte ouvre la page **Cabinet**.

### Les notifications

La cloche 🔔 de la barre du haut réunit vos notifications de LabFlow Compta, par exemple la réponse de l'équipe LabFlow à une demande de gérants. Un nombre en rouge signale les nouvelles ; ouvrir la cloche les marque comme lues.

### Aide

Le bouton **?** en haut de chaque page ouvre ce manuel dans un nouvel onglet, à la fiche de la page.$f207a$, 'compta-bienvenue', 'efe7fc1cdca543ec8789ae66b9cc767a'),
($f207b$## 🏢 Mon cabinet

Cette page présente votre cabinet tel que LabFlow le connaît. Vous la trouvez dans le menu de gauche, entrée **Mon cabinet**.

### Ce que vous voyez

- **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse et représentant légal. C'est l'identité qui figure sur vos factures d'abonnement.
- **Contact** : le nom, l'adresse email et le téléphone du titulaire du compte.
- **Gérants** : les gérants en place sur le nombre prévu dans votre abonnement. **Gérer mes gérants** ouvre la page **Mes gérants**, où vous ouvrez les accès de vos collaborateurs.

### Points d'attention

:::attention
Votre identité est enregistrée par l'équipe LabFlow. Pour la corriger, contactez-la : la modification s'appliquera aux factures suivantes, jamais à celles déjà émises.
:::$f207b$, 'compta-cabinet', '01f54acaff1ef173414618be17111b90'),
($f207c$## 💳 Abonnement et factures

Cette page récapitule votre abonnement à LabFlow Compta et réunit vos factures. Vous la trouvez dans le menu de gauche, entrée **Abonnement et factures**.

### Ce que vous voyez

- **État du compte** : actif, en lecture seule, suspendu ou archivé.
- **Votre abonnement** : le détail de la mensualité poste par poste (abonnement mensuel du cabinet, gérants supplémentaires) et le **total mensuel**. Une promotion en cours apparaît avec sa période.
- **Frais de mise en route** : leur montant et leur état (payés, en attente…).
- **Vos mensualités** : chaque mois, son montant et son état. Une mensualité réglée a sa **facture** à télécharger en PDF.

### Actions pas à pas

1. **Télécharger une facture** : dans la liste des mensualités, cliquez sur **Facture** en face d'un mois réglé ; le PDF s'enregistre sur votre appareil.
2. **Ajouter des gérants** : page **Mes gérants**, bouton **Demander des gérants**. Après la validation de l'équipe LabFlow, le nouveau montant s'applique à partir du mois suivant. Pour en avoir moins, retirez d'abord les gérants en trop, puis contactez l'équipe LabFlow.

### Points d'attention

:::attention
La facture d'un mois réglé ne change plus : elle garde l'identité et le détail du moment de son règlement.
:::$f207c$, 'compta-abonnement', '4d5ea679f175c4f1ddccb29d700e9f65')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- 2) Nouvelles fiches : la page « Mes gérants » du titulaire et la page du cabinet vue par un collaborateur (leur « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-gerants', 'Mes gérants', '👥', 1015, $f207d$## 👥 Mes gérants

Cette page vous permet d'ouvrir un accès à votre cabinet à vos collaborateurs. Vous la trouvez dans le menu de gauche, entrée **Mes gérants**, ou depuis la page **Mon cabinet**. Elle est réservée au titulaire du cabinet.

### Ce que vous voyez

- **Le compteur** : les gérants en place sur le nombre prévu dans votre abonnement. Un gérant désactivé garde sa place.
- **Vos gérants** : pour chacun, son nom, son adresse email, son niveau et son état : **Actif**, **Invitation envoyée** (compte pas encore activé) ou **Désactivé**.

### Actions pas à pas

1. **Ajouter un gérant** : cliquez sur **+ Gérant**, saisissez son nom, son adresse email et son niveau, puis cliquez sur **Enregistrer**. Une adresse inconnue reçoit une invitation à activer son compte LabFlow Compta, valable 48 heures ; une adresse déjà connue reçoit l'accès tout de suite, avec un email.
2. **Modifier** : changez son nom ou son niveau. Une autre adresse donne l'accès à une autre personne : l'actuelle le perd, sans en être prévenue.
3. **Désactiver** : le gérant ne voit plus votre cabinet, mais sa fiche est gardée et sa place reste comptée. **Réactiver** le remet tel quel.
4. **Retirer** : l'accès disparaît et la place est libérée.
5. **Renvoyer** : une nouvelle invitation part pour un compte pas encore activé.
6. **Demander des gérants** : quand toutes les places sont prises, indiquez le nombre voulu et envoyez la demande ; l'équipe LabFlow la valide.

### Les niveaux

| Niveau | Ce que la personne pourra faire |
|---|---|
| Consultation | tout lire, sans rien écrire |
| Saisie | saisir les pièces et les écritures, sans valider, clôturer ni configurer |
| Complet | tout, y compris valider, clôturer et configurer le dossier |

Les niveaux prendront effet avec les dossiers et la saisie.

### Points d'attention

:::attention
Les gérants ajoutés sont facturés à partir du mois qui suit la validation de votre demande. Tant que votre abonnement attend un paiement, vous ne pouvez ni ajouter, ni modifier, ni réactiver, ni demander des gérants ; désactiver et retirer restent toujours possibles.
:::

:::astuce
Une personne désactivée ou retirée n'en est pas prévenue par email.
:::$f207d$, 'gérants, collaborateurs, accès, inviter, désactiver, réactiver, retirer, niveau, demande', '/gerants'),
  ('compta-cabinet-membre', 'Cabinet (collaborateur)', '🏢', 1050, $f207e$## 🏢 Cabinet (collaborateur)

Cette page présente le cabinet dont vous êtes collaborateur. Vous l'ouvrez depuis l'accueil, groupe **Mon cabinet**.

### Ce que vous voyez

- **Le cabinet** : son identité (raison sociale, forme juridique, matricule fiscal, adresse).
- **Le titulaire** : son nom, son adresse email et son téléphone.
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet) et la date à laquelle il vous a été ouvert.
- **Les dossiers** : ils arriveront dans une prochaine version de LabFlow Compta.

### Points d'attention

:::attention
Votre accès est géré par le titulaire du cabinet : pour changer votre niveau ou fermer votre accès, adressez-vous à lui.
:::$f207e$, 'cabinet, collaborateur, gérant, titulaire, niveau, accès', '/cabinets')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
