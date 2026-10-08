-- LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6b, §2,
-- §4 ; réponses du client du 08/10 — « ok pour les 8 » : numéro définitif attribué à la validation, continu par journal
-- et par exercice (AC-2026-000001) ; le niveau Saisie ne valide pas ; clôture par le titulaire ou Complet quand tout est
-- validé, réouverture par le titulaire seul, journalisée, tant que l'exercice est ouvert ; CADRAGE §4 : validation =
-- définitif (NC 01 §54, §56), clôture des périodes et centralisation (§57 à §61, §45), journal général coté et paraphé
-- (§47, §48), piste d'audit). Migration additive : aucune écriture, période ni fiche existante ne change de sens.
-- 1) Les périodes gardent qui les a closes ou rouvertes, et quand (piste d'audit ; le journal des événements D16 garde
--    chaque clôture et chaque réouverture). L'état lui-même (ouverte / close) existe depuis la migration 208.
ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS clos_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS clos_le TIMESTAMPTZ;
ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS rouvert_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS rouvert_le TIMESTAMPTZ;

-- 2) Les écritures : la vraie date d'une opération enregistrée au premier jour de la période ouverte suivante (NC 01 §61)
--    précède toujours la date d'enregistrement ; le numéro définitif se calcule par journal et par exercice (MAX sous le
--    verrou du dossier : une écriture validée ne se supprime jamais, la série reste continue) ; une contre-passation
--    retrouve son écriture d'origine et réciproquement (origine_id).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compta_ecritures_date_reelle') THEN
    ALTER TABLE compta.ecritures ADD CONSTRAINT ck_compta_ecritures_date_reelle CHECK (date_reelle IS NULL OR date_reelle < date);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_numero_journal ON compta.ecritures (dossier_id, journal_id, exercice_id, numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_origine ON compta.ecritures (origine_id) WHERE origine_id IS NOT NULL;

-- 3) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui de la migration 215 (« Écritures », « Fiche du dossier ») ; garde md5 du texte par défaut, sans
--    \r ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne
--    correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f216a$## ✍️ Écritures

Les écritures d'un dossier sont ses opérations comptables : chacune porte une date, un journal, la référence de sa pièce justificative, un libellé et au moins deux lignes dont le total des débits égale le total des crédits (partie double). Cette page les saisit **en brouillard** (modifiables, supprimables), puis les **valide** : une écriture validée est définitive, reçoit son numéro définitif et ne se corrige plus que par **contre-passation**. Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, ligne **Écritures**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les filtres** : le journal (tous ou un), la période (un mois de l'exercice ouvert, le mois en cours par défaut, ou toutes), l'état (toutes, brouillard, validées) et la recherche : un mot du libellé, la référence de la pièce ou un montant (par exemple 1190,500 : le total de l'écriture ou l'une de ses lignes).
- **La liste**, par pages de 25 (**Afficher plus** charge les suivantes), de la plus récente à la plus ancienne : numéro (provisoire B-000012 en brouillard, définitif AC-2026-000001 une fois validée), date (et la vraie date de l'opération quand elle diffère), journal, pièce, libellé, total et état (**Brouillard** ou **Validée**). Cliquez sur une écriture pour voir ses lignes : compte, tiers, libellé, débit, crédit, code de taxe, échéance ; puis qui l'a saisie, qui l'a validée et quand, et son lien de contre-passation s'il existe.
- **Le bandeau** : le nombre d'écritures en brouillard et validées du dossier ; quand une période est choisie, le nombre d'écritures en brouillard qu'elle contient encore.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** saisissent, modifient et suppriment les écritures en brouillard ; le titulaire et le niveau **Complet** valident, valident la période et contre-passent ; le niveau **Consultation** lit. Un dossier archivé se lit, ne se saisit pas.

### Actions pas à pas

1. **Saisir une écriture** : **+ Écriture**. Choisissez le journal, la date (dans une période ouverte de l'exercice ouvert), la **référence de la pièce** (numéro de facture, de relevé… obligatoire, 80 caractères au plus), le libellé ; puis les **lignes** : le compte (recherche par numéro ou par mot du libellé ; seuls les comptes imputables, actifs et sans sous-compte actif, sont proposés), le tiers quand le compte est collectif (fournisseurs ou clients : obligatoire alors, choisi parmi les tiers actifs du même type), le libellé de la ligne (celui de l'écriture par défaut), le débit **ou** le crédit (en dinars, trois décimales au plus, la virgule est acceptée), le code de taxe (facultatif) et l'échéance (facultative ; proposée d'après le délai de paiement du tiers). Le pied affiche le total des débits, le total des crédits et l'écart : **Enregistrer** n'est possible qu'à écart nul. L'écriture reçoit un numéro provisoire et la date de traitement du serveur.
2. **Ajouter la TVA** : sur une ligne hors taxes qui porte un code de TVA (TVA19…), ce bouton crée la ligne de taxe, calculée au millime près (le demi-millime arrondi vers le haut), sur le compte du code : à l'achat ou à la vente selon le journal, sur immobilisations quand le compte de la ligne en est une. Même chose pour un droit de timbre (montant fixe) ou le FODEC. La ligne créée reste modifiable.
3. **Ajouter la retenue** : sur un journal d'achats ou de ventes, pour un tiers qui a une retenue par défaut (ou avec le code que vous choisissez), ce bouton crée la ligne de retenue à la source, calculée sur le **TTC hors timbre** (toutes les lignes sauf celles du tiers, du timbre, des retenues et des avances), au crédit du compte des retenues opérées à l'achat (432), au débit du compte des retenues subies à la vente (4341) ; la ligne du tiers passe au net. Le même bouton sert aux **retenues de TVA** (RSTVA25, RSTVA100 : calculées sur les lignes de TVA, ajoutez la TVA d'abord) et aux **avances** (AV_FORF1, AV_ALC5 : sur le TTC hors timbre, du même côté que la pièce ; la ligne du tiers augmente). Le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : retirez la ligne quand la retenue n'est pas due.
4. **Modifier** / **Supprimer** une écriture en brouillard : depuis ses lignes. Le journal de la comptabilité garde la valeur d'avant et celle d'après, et le contenu d'une écriture supprimée.
5. **Valider** une écriture (titulaire, Complet) : depuis ses lignes ; une confirmation rappelle que c'est **définitif**. L'écriture reçoit son **numéro définitif**, continu par journal et par exercice (AC-2026-000001, AC-2026-000002…), l'auteur et l'heure de la validation ; elle ne se modifie plus et ne se supprime plus.
6. **Valider la période** : choisissez une période dans les filtres ; le bouton valide **toutes** ses écritures en brouillard, dans l'ordre des dates puis des numéros provisoires (la numérotation suit ainsi la chronologie). La validation a lieu au plus tard à la fin de chaque mois (NC 01 §54).
7. **Contre-passer** une écriture validée (titulaire, Complet) : une erreur dans une écriture validée se corrige par une écriture inverse — mêmes comptes, mêmes tiers, mêmes codes, débits et crédits échangés —, dans le même journal, datée du jour (ou de la date que vous choisissez, dans une période ouverte, jamais avant l'écriture d'origine), libellée « Contre-passation de … », validée aussitôt avec le numéro suivant et liée à l'écriture d'origine (le lien se voit sur les deux). Saisissez ensuite l'écriture correcte. Une écriture ne se contre-passe qu'une fois.
8. **Opération d'une période close** : si la date choisie tombe dans une période close, la fenêtre propose de l'enregistrer **au premier jour de la période ouverte suivante en gardant sa vraie date** (NC 01 §61) ; la liste montre les deux dates. La vraie date sert aussi au contrôle des échéances.

### Points d'attention

:::attention
Une écriture refusée le dit : débits et crédits différents, moins de deux lignes ou un seul compte, date hors de l'exercice ouvert ou dans une période close, journal désactivé, compte non imputable (désactivé ou avec des sous-comptes actifs), tiers manquant sur un compte collectif ou posé sur un autre compte, code de taxe désactivé, échéance avant la date de l'écriture (ou sa vraie date).
:::

:::attention
Validé = définitif (NC 01 §54, §56) : une écriture validée ne se modifie ni ne se supprime ; elle se contre-passe. Dès qu'une écriture existe, le dossier ne se supprime plus et les dates de son exercice ne changent plus ; un compte, un journal ou un code de taxe porté par une écriture ne se désactive ni ne se supprime plus ; un tiers porté par une écriture ne se supprime plus (il se désactive), son code et son compte collectif ne changent plus. La date de traitement est celle du serveur, jamais modifiable (NC 01).
:::

:::astuce
Le numéro provisoire (B-000012) n'est pas le numéro définitif : celui-ci, continu par journal et par exercice (AC-2026-000001), est attribué à la validation. Un brouillard supprimé ne laisse donc aucun trou dans la série définitive ; pour une numérotation dans l'ordre des dates, validez par période. La clôture des périodes, leur réouverture et le journal général imprimable sont sur la page **Périodes** (fiche « Validation et périodes »).
:::
$f216a$, 'compta-ecritures', '36016f71f4ea550dee3719e7b03c173b'),
($f216b$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées) et ses **périodes** (ouvertes, closes) ; **Ouvrir** mène aux pages **Écritures** et **Périodes** (fiches de ce manuel). Le grand livre et la balance arrivent à l'étape des livres.
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f216b$, 'compta-dossier', 'eb26210b2100033938c8f567c3e716e8')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : la page « Périodes » d'un dossier (son bouton « ? ») — validation, clôture, réouverture, journal général.
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-periodes', 'Validation et périodes', '🔏', 1071, $f216c$## 🔏 Validation et périodes

Une écriture naît en brouillard et devient définitive à sa **validation** ; chaque mois de l'exercice est une **période** qui, une fois toutes ses écritures validées, se **clôt** : sa chronologie est figée et son **journal général** s'imprime pour être coté et paraphé (norme comptable NC 01, §54 à §61). Cette page montre les périodes de l'exercice ouvert et les actions qui les concernent. Vous l'ouvrez depuis la fiche du dossier, carte **Tenue**, ligne **Périodes**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les mois de l'exercice**, du premier au dernier : pour chacun, son état (**Ouverte** ou **Close**, avec qui l'a close et quand ; une période rouverte montre aussi qui l'a rouverte et quand, jusqu'à sa prochaine clôture), le nombre d'écritures **en brouillard** et **validées**, le total des écritures validées, et ses boutons.
- **Le détail d'une période** (cliquez dessus) : la **centralisation** de ses journaux auxiliaires — pour chaque journal (achats, ventes, banque, caisse, opérations diverses, à-nouveaux), le nombre d'écritures validées et leurs totaux débit et crédit ; le total général, égal des deux côtés.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** valident et clôturent ; **le titulaire seul rouvre** une période ; les niveaux **Saisie** et **Consultation** lisent et impriment.

### Actions pas à pas

1. **Valider tout** : valide d'un coup toutes les écritures en brouillard de la période, dans l'ordre des dates puis des numéros provisoires ; chacune reçoit son numéro définitif, continu par journal et par exercice (AC-2026-000001…). Même action que **Valider la période** sur la page **Écritures**. C'est **définitif** : une confirmation est demandée.
2. **Clore** : possible quand la période n'a plus aucune écriture en brouillard (sinon le bouton reste fermé et le nombre restant est indiqué). Une période close n'accepte plus d'écriture datée dedans : ni saisie, ni modification, ni contre-passation. La norme veut la clôture au plus tard avant la fin de la période suivante.
3. **Rouvrir** (titulaire seul) : rend la période ouverte, tant que l'exercice est ouvert ; la réouverture est journalisée (qui, quand) et se voit sur la page. Les écritures validées restent validées : rouvrir sert à enregistrer une opération oubliée, pas à défaire ce qui est validé.
4. **Journal général (PDF)** : imprime le journal général de la période — en-tête (dossier, matricule, période, date d'édition), **centralisation** des journaux auxiliaires, puis toutes les écritures validées dans l'ordre chronologique avec leurs lignes (compte, tiers, libellé, débit, crédit), les totaux de la période et des **pages numérotées** ; les écritures en brouillard n'y figurent pas (leur nombre est indiqué). C'est ce document, coté et paraphé, que la norme demande (NC 01 §47, §48).
5. **Écritures** : ouvre la page **Écritures** filtrée sur la période.

### Points d'attention

:::attention
Une opération datée d'une période close s'enregistre au **premier jour de la période ouverte suivante**, avec sa vraie date (NC 01 §61) : la fenêtre de saisie le propose d'elle-même. Rouvrir une période n'est à faire qu'à titre exceptionnel.
:::

:::attention
Clore une période ne clôt pas l'exercice : la clôture de l'exercice (résultat, à-nouveaux, états financiers) arrive à une étape ultérieure. Les périodes se clôturent une à une ; clôturez-les dans l'ordre des mois pour une chronologie sans trou.
:::

:::astuce
Le journal des événements de la comptabilité garde chaque validation (par écriture ou par période), chaque contre-passation, chaque clôture et chaque réouverture, avec son auteur et son heure : c'est la piste d'audit.
:::
$f216c$, 'périodes, période, validation, valider, valider tout, définitif, numéro définitif, AC-2026-000001, contre-passation, clôture, clore, rouvrir, réouverture, période close, période ouverte, journal général, PDF, coté et paraphé, centralisation, journaux auxiliaires, vraie date, premier jour de la période ouverte, NC 01, piste d''audit', '/periodes')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
