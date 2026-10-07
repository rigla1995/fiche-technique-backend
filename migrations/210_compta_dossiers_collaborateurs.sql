-- LabFlow Compta, étape S4c « Les dossiers de chaque collaborateur » (labflow-reprise/achats-compta/PLAN-S4.md §1 ;
-- réponses 2 et 4 du client du 07/10 ; ETAPE-S4c.md §2). Migration du MANUEL seulement : aucune table ne change —
-- compta.acces.tous_dossiers et compta.acces_dossiers (migration 208) sont désormais écrites par le code
-- (comptablesClient.js, gerantsCabinet.js, dossiers.js) ; les accès existants gardent « tous les dossiers ».
-- Fiches « Mes gérants », « Ma comptabilité », « Comptabilité confiée » et « Cabinet (collaborateur) » complétées : texte
-- remplacé seulement s'il est encore celui des migrations 207, 208 et 209 (garde md5 du texte par défaut, sans \r) ; le
-- texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond
-- plus. Vocabulaire comptable fixe : jamais de balise.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f210a$## 👥 Mes gérants

Cette page vous permet d'ouvrir un accès à votre cabinet à vos collaborateurs. Vous la trouvez dans le menu de gauche, entrée **Mes gérants**, ou depuis la page **Mon cabinet**. Elle est réservée au titulaire du cabinet.

### Ce que vous voyez

- **Le compteur** : les gérants en place sur le nombre prévu dans votre abonnement. Un gérant désactivé garde sa place.
- **Vos gérants** : pour chacun, son nom, son adresse email, son niveau, ses dossiers (**Tous les dossiers**, ou les dossiers qui lui sont ouverts) et son état : **Actif**, **Invitation envoyée** (compte pas encore activé) ou **Désactivé**.

### Actions pas à pas

1. **Ajouter un gérant** : cliquez sur **+ Gérant**, saisissez son nom, son adresse email, son niveau et ses dossiers (**Tous les dossiers**, ou **Choisir** puis cochez-les), puis cliquez sur **Enregistrer**. Une adresse inconnue reçoit une invitation à activer son compte LabFlow Compta, valable 48 heures ; une adresse déjà connue reçoit l'accès tout de suite, avec un email.
2. **Modifier** : changez son nom, son niveau ou ses dossiers. Une autre adresse donne l'accès à une autre personne : l'actuelle le perd, sans en être prévenue.
3. **Désactiver** : le gérant ne voit plus votre cabinet, mais sa fiche est gardée et sa place reste comptée. **Réactiver** le remet tel quel.
4. **Retirer** : l'accès disparaît et la place est libérée.
5. **Renvoyer** : une nouvelle invitation part pour un compte pas encore activé.
6. **Demander des gérants** : quand toutes les places sont prises, indiquez le nombre voulu et envoyez la demande ; l'équipe LabFlow la valide.

### Les dossiers de chaque gérant

- **Tous les dossiers** : le gérant voit tous les dossiers du cabinet, ceux d'aujourd'hui comme ceux que vous créerez ensuite.
- **Choisir** : il ne voit que les dossiers cochés. Un nouveau gérant commence avec **Choisir** et aucun dossier coché : il ne voit rien tant que vous n'avez pas coché ses dossiers. Les gérants déjà en place avant cette fonction gardent **Tous les dossiers** tant que vous ne les réglez pas.
- Partout, un gérant ne voit et ne modifie que ses dossiers : liste, recherche, fiches. Un dossier qu'il crée lui-même lui est ouvert aussitôt.
- Les dossiers archivés figurent dans la liste à cocher, marqués **Archivé**.

### Les niveaux

| Niveau | Ce que la personne pourra faire |
|---|---|
| Consultation | tout lire, sans rien écrire |
| Saisie | saisir les pièces et les écritures, sans valider, clôturer ni configurer |
| Complet | tout, y compris valider, clôturer et configurer le dossier |

Sur les dossiers : un gérant de niveau **Complet** crée et modifie des dossiers (parmi les siens) ; **Saisie** et **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier vous sont réservés.

### Points d'attention

:::attention
Les gérants ajoutés sont facturés à partir du mois qui suit la validation de votre demande. Tant que votre abonnement attend un paiement, ou s'il est bloqué ou suspendu, vous ne pouvez ni ajouter, ni modifier, ni réactiver, ni demander des gérants, ni renvoyer une invitation, ni changer les dossiers d'un gérant ; désactiver et retirer restent toujours possibles.
:::

:::astuce
Une personne désactivée ou retirée n'en est pas prévenue par email. Un gérant dont aucun dossier n'est coché garde sa carte « Cabinet … » sur son accueil : il y lit qu'aucun dossier ne lui est ouvert.
:::$f210a$, 'compta-gerants', '470eebf93ea7be6a7f4b96bd98ea4c96'),
($f210b$## 📒 Ma comptabilité

Cette page présente la comptabilité de votre entreprise dans LabFlow Compta. Elle existe dès que le **module Comptabilité** est activé sur votre compte LabFlow. Vous la trouvez dans le menu de gauche, entrée **Ma comptabilité**, ou depuis l'accueil.

### Ce que vous voyez

- **Votre module** : le prix mensuel du module (et des gérants comptables supplémentaires s'il y en a) et le mois à partir duquel il est facturé, avec votre abonnement LabFlow, sur la même facture.
- **Votre comptable** : le module comprend l'accès d'un comptable. Tant que vous ne l'avez pas désigné, il apparaît « À désigner » ; ensuite, vous voyez son nom, son adresse, son niveau, ses dossiers et « Invitation envoyée » tant qu'il n'a pas activé son compte.
- **Gérants comptables supplémentaires** : les autres accès comptables, dans la limite achetée, avec leurs dossiers.
- **Mes dossiers** : le dossier **« Mon entreprise »** a été créé d'office d'après l'identité de votre compte LabFlow (raison sociale, matricule fiscal, adresse) ; s'il lui manque quelque chose, il porte la mention **Identité à compléter**. Vous pouvez ouvrir d'autres dossiers pour vos autres entités (bouton **+ Dossier**). Chaque carte ouvre la fiche du dossier.

### Actions pas à pas

1. **Activer le module** : dans LabFlow, page **Mon abonnement**, carte **Module Comptabilité**, cliquez sur **Demander l'activation** ; l'équipe LabFlow valide votre demande.
2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.
3. **Désigner votre comptable** : cliquez sur **Gérer sur LabFlow**. La page **Gérants** de LabFlow s'ouvre, partie **Gérants Comptabilité** : indiquez son nom, son adresse email et son niveau.
4. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes : identité (avec **Lire la patente**), régime fiscal, premier exercice, récapitulatif. Seule la raison sociale est obligatoire.
5. **Régler les dossiers d'un accès** : sur la ligne **Dossiers** de la carte de votre comptable ou d'un gérant comptable supplémentaire, cliquez sur **Régler**, choisissez **Tous les dossiers** ou **Choisir** et cochez, puis **Enregistrer**. Votre comptable voit tous vos dossiers tant que vous ne l'avez pas restreint ; un gérant comptable supplémentaire n'en voit aucun tant que vous n'avez pas coché les siens. Les noms, adresses et niveaux se règlent dans LabFlow (page Gérants) ; les dossiers se règlent ici. Si vous désignez un autre comptable depuis LabFlow, il voit tous les dossiers.

### Les niveaux

| Niveau | Ce que la personne pourra faire |
|---|---|
| Consultation | tout lire, sans rien écrire |
| Saisie | saisir les pièces et les écritures, sans valider, clôturer ni configurer |
| Complet | tout, y compris valider, clôturer et configurer le dossier |

Sur les dossiers : votre comptable et vos gérants comptables de niveau **Complet** créent et modifient des dossiers (parmi ceux qui leur sont ouverts) ; ceux de niveau **Saisie** ou **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier vous sont réservés ; le dossier « Mon entreprise » ne se supprime pas, il s'archive.

### Points d'attention

:::attention
Le module est facturé à son prix, à partir du mois qui suit son activation. Les promotions de votre abonnement LabFlow ne s'y appliquent pas. Un accès restreint ne voit et ne modifie que les dossiers cochés ; un dossier qu'il crée lui est ouvert aussitôt. Si vous retirez ou remplacez votre comptable, son accès revient à **Tous les dossiers**. Tant que votre abonnement attend un paiement, les dossiers de vos accès ne se changent pas.
:::

:::astuce
Le dossier « Mon entreprise » a copié votre identité LabFlow le jour de sa création. Si vous la corrigez ensuite dans LabFlow (page **Mon entreprise**), le bouton **Reprendre l'identité de LabFlow** de sa fiche la recopie dans le dossier.
:::$f210b$, 'compta-ma-comptabilite', 'c8bf2076d534e27cbb6bda1a4a5c6b5f'),
($f210c$## 🤝 Comptabilité confiée

Cette page présente une comptabilité qu'un client LabFlow vous a confiée. Vous l'ouvrez depuis l'accueil, groupe **Comptabilités confiées par des clients LabFlow**.

### Ce que vous voyez

- **Le client** : son identité (raison sociale, forme juridique, matricule fiscal, adresse) et son contact (nom, adresse email, téléphone).
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet), la date à laquelle la comptabilité vous a été confiée et vos dossiers : **Tous les dossiers du client** ou **Ceux qui vous sont ouverts**.
- **Les dossiers** : les dossiers du client qui vous sont ouverts — son dossier **« Mon entreprise »** (créé d'office d'après son compte LabFlow) et ses autres entités, selon ce que le client vous a ouvert. Chaque carte ouvre la fiche du dossier. Avec le niveau **Complet**, vous pouvez créer des dossiers (bouton **+ Dossier**) et les modifier ; un dossier que vous créez vous est ouvert aussitôt. Avec les niveaux **Saisie** et **Consultation**, vous les consultez. Archiver, désarchiver et supprimer un dossier sont réservés au client.

### Actions pas à pas

1. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).
2. **Quitter cet accès** : cliquez sur **Quitter cet accès**, puis confirmez. La comptabilité disparaît de votre accueil et le client en est prévenu.

### Points d'attention

:::attention
Une comptabilité confiée suit l'abonnement de son client : si cet abonnement est suspendu, la page l'indique et la comptabilité n'est plus modifiable. Si aucun dossier ne vous est ouvert, la page le dit : adressez-vous au client.
:::

:::astuce
Seul le client peut vous redonner un accès que vous avez quitté, ou vous ouvrir d'autres dossiers.
:::$f210c$, 'compta-confiee', '18fb0e64cf95959a10e5f774c9992851'),
($f210d$## 🏢 Cabinet (collaborateur)

Cette page présente le cabinet dont vous êtes collaborateur. Vous l'ouvrez depuis l'accueil, groupe **Mon cabinet**.

### Ce que vous voyez

- **Le cabinet** : son identité (raison sociale, forme juridique, matricule fiscal, adresse).
- **Le titulaire** : son nom, son adresse email et son téléphone.
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet), la date à laquelle il vous a été ouvert et vos dossiers : **Tous les dossiers du cabinet** ou **Ceux qui vous sont ouverts**.
- **Les dossiers** : les dossiers du cabinet qui vous sont ouverts, avec leur matricule et leur exercice en cours. Chaque carte ouvre la **fiche du dossier**. Avec le niveau **Complet**, vous pouvez aussi créer des dossiers (bouton **+ Dossier**) et les modifier ; un dossier que vous créez vous est ouvert aussitôt. Avec les niveaux **Saisie** et **Consultation**, vous les consultez. Si aucun dossier ne vous est ouvert, la page le dit.

### Points d'attention

:::attention
Votre accès est géré par le titulaire du cabinet : pour changer votre niveau, vos dossiers ou fermer votre accès, adressez-vous à lui.
:::$f210d$, 'compta-cabinet-membre', '5f9958d8b9413806bb03a220cb169ec6')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
