-- LabFlow Compta, étape S4d « Grands cabinets » (labflow-reprise/achats-compta/ETAPE-S5.md §2 ; remarque du client du
-- 07/10 : des centaines, voire des milliers de dossiers par cabinet ; réponses du client : 25 dossiers par page, bouton
-- « Afficher plus », dossiers archivés présents et marqués dans la liste à cocher). Migration additive.
-- 1) Index par dossier sur les dossiers ouverts aux accès (relecture de S4c) : la suppression d'un dossier (cascade) et
--    toute recherche par dossier ne balaient plus la table. Index de tri de la liste (comptabilité, état, nom, id) : la
--    première page d'un grand cabinet se lit sans trier tous ses dossiers.
CREATE INDEX IF NOT EXISTS idx_compta_acces_dossiers_dossier ON compta.acces_dossiers (dossier_id);
CREATE INDEX IF NOT EXISTS idx_compta_dossiers_tri ON compta.dossiers (espace_id, etat, LOWER(nom), id);

-- 2) Manuel de LabFlow Compta : la liste des dossiers se lit par pages avec la recherche côté serveur ; la liste à cocher
--    des dossiers d'un accès montre d'abord les dossiers cochés puis une recherche. Fiches existantes : texte remplacé
--    seulement s'il est encore celui des migrations 208 (« Dossiers ») et 210 (« Mes gérants », « Ma comptabilité »,
--    « Comptabilité confiée », « Cabinet (collaborateur) ») (garde md5 du texte par défaut, sans \r) ; le texte servi suit
--    seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
--    Vocabulaire comptable fixe : jamais de balise.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f211a$## 📁 Dossiers

Un dossier est une entreprise dont vous tenez la comptabilité : une entité juridique, avec son identité légale, son régime fiscal et ses exercices. Cette page réunit les dossiers de votre cabinet. Vous la trouvez dans le menu de gauche, entrée **Dossiers**.

### Ce que vous voyez

- **La liste des dossiers** : pour chacun, son nom, son matricule fiscal, sa forme juridique et son exercice en cours. Un dossier dont l'identité est incomplète porte la mention **Identité à compléter**. Un dossier archivé porte la mention **Archivé** et n'apparaît que si vous cochez **Afficher les archivés**. La liste s'affiche par pages de 25 : **Afficher plus** charge les suivants.
- **La recherche** : tapez un nom, une raison sociale, un nom commercial ou un matricule ; la recherche porte sur tous les dossiers du cabinet, pas seulement sur ceux affichés.
- **Qui peut quoi** : le titulaire du cabinet et les gérants de niveau **Complet** créent et modifient des dossiers ; les gérants de niveau **Saisie** ou **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier sont réservés au titulaire.

### Actions pas à pas

1. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes.
   - **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Lire la patente** (PDF, photo ou code QR) remplit les champs vides ; vous pouvez tout corriger. Seule la raison sociale est obligatoire.
   - **Régime fiscal** : personne morale ou physique, impôt (IS ou IRPP), régime de TVA (réel, forfaitaire ou non assujetti), exportateur total, télédéclaration, date de début d'activité. Les deux premiers sont proposés d'après la forme juridique.
   - **Premier exercice** : l'année civile en cours est proposée ; vous pouvez choisir d'autres dates (la fin doit être le dernier jour d'un mois, douze mois au plus). Les périodes mensuelles sont créées avec l'exercice.
   - **Récapitulatif**, puis **Créer le dossier**.
2. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).

### Points d'attention

:::attention
Un matricule fiscal déjà porté par un autre dossier du cabinet n'est pas refusé (groupes, franchises) : un avertissement vous le signale.
:::

:::astuce
Le plan de comptes, les journaux, les taxes et les tiers de chaque dossier arrivent à la prochaine étape de LabFlow Compta.
:::$f211a$, 'compta-dossiers', 'b04ad732868b7f99e3fb6037fa419277'),
($f211b$## 👥 Mes gérants

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
- **La liste à cocher** montre d'abord les dossiers cochés, avec leur nombre, puis une recherche pour en ajouter : les résultats s'affichent par 25 (**Afficher plus**) ; **Cocher les … affichés** coche d'un coup les résultats affichés. Les dossiers archivés y figurent, marqués **Archivé**.
- Partout, un gérant ne voit et ne modifie que ses dossiers : liste, recherche, fiches. Un dossier qu'il crée lui-même lui est ouvert aussitôt.

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
:::$f211b$, 'compta-gerants', '52e0bac3fe6ec27a4530572c066435d1'),
($f211c$## 📒 Ma comptabilité

Cette page présente la comptabilité de votre entreprise dans LabFlow Compta. Elle existe dès que le **module Comptabilité** est activé sur votre compte LabFlow. Vous la trouvez dans le menu de gauche, entrée **Ma comptabilité**, ou depuis l'accueil.

### Ce que vous voyez

- **Votre module** : le prix mensuel du module (et des gérants comptables supplémentaires s'il y en a) et le mois à partir duquel il est facturé, avec votre abonnement LabFlow, sur la même facture.
- **Votre comptable** : le module comprend l'accès d'un comptable. Tant que vous ne l'avez pas désigné, il apparaît « À désigner » ; ensuite, vous voyez son nom, son adresse, son niveau, ses dossiers et « Invitation envoyée » tant qu'il n'a pas activé son compte.
- **Gérants comptables supplémentaires** : les autres accès comptables, dans la limite achetée, avec leurs dossiers.
- **Mes dossiers** : le dossier **« Mon entreprise »** a été créé d'office d'après l'identité de votre compte LabFlow (raison sociale, matricule fiscal, adresse) ; s'il lui manque quelque chose, il porte la mention **Identité à compléter**. Vous pouvez ouvrir d'autres dossiers pour vos autres entités (bouton **+ Dossier**). Chaque carte ouvre la fiche du dossier. La liste s'affiche par pages de 25 (**Afficher plus**) et la recherche porte sur tous vos dossiers.

### Actions pas à pas

1. **Activer le module** : dans LabFlow, page **Mon abonnement**, carte **Module Comptabilité**, cliquez sur **Demander l'activation** ; l'équipe LabFlow valide votre demande.
2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.
3. **Désigner votre comptable** : cliquez sur **Gérer sur LabFlow**. La page **Gérants** de LabFlow s'ouvre, partie **Gérants Comptabilité** : indiquez son nom, son adresse email et son niveau.
4. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes : identité (avec **Lire la patente**), régime fiscal, premier exercice, récapitulatif. Seule la raison sociale est obligatoire.
5. **Régler les dossiers d'un accès** : sur la ligne **Dossiers** de la carte de votre comptable ou d'un gérant comptable supplémentaire, cliquez sur **Régler**, choisissez **Tous les dossiers** ou **Choisir** et cochez, puis **Enregistrer**. La liste à cocher montre d'abord les dossiers cochés, puis une recherche pour en ajouter (résultats par 25, **Afficher plus**). Votre comptable voit tous vos dossiers tant que vous ne l'avez pas restreint ; un gérant comptable supplémentaire n'en voit aucun tant que vous n'avez pas coché les siens. Les noms, adresses et niveaux se règlent dans LabFlow (page Gérants) ; les dossiers se règlent ici. Si vous désignez un autre comptable depuis LabFlow, il voit tous les dossiers.

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
:::$f211c$, 'compta-ma-comptabilite', '8d1f64241f901a9feb462308e4558a22'),
($f211d$## 🤝 Comptabilité confiée

Cette page présente une comptabilité qu'un client LabFlow vous a confiée. Vous l'ouvrez depuis l'accueil, groupe **Comptabilités confiées par des clients LabFlow**.

### Ce que vous voyez

- **Le client** : son identité (raison sociale, forme juridique, matricule fiscal, adresse) et son contact (nom, adresse email, téléphone).
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet), la date à laquelle la comptabilité vous a été confiée et vos dossiers : **Tous les dossiers du client** ou **Ceux qui vous sont ouverts**.
- **Les dossiers** : les dossiers du client qui vous sont ouverts — son dossier **« Mon entreprise »** (créé d'office d'après son compte LabFlow) et ses autres entités, selon ce que le client vous a ouvert. La liste s'affiche par pages de 25 (**Afficher plus**) ; la recherche porte sur tous les dossiers qui vous sont ouverts ; les archivés apparaissent si vous cochez **Afficher les archivés**. Chaque carte ouvre la fiche du dossier. Avec le niveau **Complet**, vous pouvez créer des dossiers (bouton **+ Dossier**) et les modifier ; un dossier que vous créez vous est ouvert aussitôt. Avec les niveaux **Saisie** et **Consultation**, vous les consultez. Archiver, désarchiver et supprimer un dossier sont réservés au client.

### Actions pas à pas

1. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).
2. **Quitter cet accès** : cliquez sur **Quitter cet accès**, puis confirmez. La comptabilité disparaît de votre accueil et le client en est prévenu.

### Points d'attention

:::attention
Une comptabilité confiée suit l'abonnement de son client : si cet abonnement est suspendu, la page l'indique et la comptabilité n'est plus modifiable. Si aucun dossier ne vous est ouvert, la page le dit : adressez-vous au client.
:::

:::astuce
Seul le client peut vous redonner un accès que vous avez quitté, ou vous ouvrir d'autres dossiers.
:::$f211d$, 'compta-confiee', '407ea7684fe0334d39a5d6115d8bd7e4'),
($f211e$## 🏢 Cabinet (collaborateur)

Cette page présente le cabinet dont vous êtes collaborateur. Vous l'ouvrez depuis l'accueil, groupe **Mon cabinet**.

### Ce que vous voyez

- **Le cabinet** : son identité (raison sociale, forme juridique, matricule fiscal, adresse).
- **Le titulaire** : son nom, son adresse email et son téléphone.
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet), la date à laquelle il vous a été ouvert et vos dossiers : **Tous les dossiers du cabinet** ou **Ceux qui vous sont ouverts**.
- **Les dossiers** : les dossiers du cabinet qui vous sont ouverts, avec leur matricule et leur exercice en cours. La liste s'affiche par pages de 25 (**Afficher plus**) ; la recherche porte sur tous les dossiers qui vous sont ouverts ; les archivés apparaissent si vous cochez **Afficher les archivés**. Chaque carte ouvre la **fiche du dossier**. Avec le niveau **Complet**, vous pouvez aussi créer des dossiers (bouton **+ Dossier**) et les modifier ; un dossier que vous créez vous est ouvert aussitôt. Avec les niveaux **Saisie** et **Consultation**, vous les consultez. Si aucun dossier ne vous est ouvert, la page le dit.

### Points d'attention

:::attention
Votre accès est géré par le titulaire du cabinet : pour changer votre niveau, vos dossiers ou fermer votre accès, adressez-vous à lui.
:::$f211e$, 'compta-cabinet-membre', 'b2c21f9dc58b2f21d7de367074983273')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
