-- 237 — Unité des produits utilisables (P1) : unité finale et quantité produite dans l’assistant, recette saisie pour la quantité produite et enregistrée pour 1 unité, stock et production comptés dans cette unité.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["produits-utilisables","calc-production-pt"],"titres":[],"entrees":[],"variantes":[]}

DO $m237$
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
  -- ── produits-utilisables ──
  t := $m237_produits_utilisables$## 🧪 [[Titre:produit_utilisable:pl]] ([[nom:pt:pl]])

[[Det:produit_utilisable:un]]**[[nom:produit_utilisable]]** ([[court:produit_utilisable]]) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n'est pas vendue telle quelle mais **réutilisée dans d'autres [[nom:recette:pl]]**. Vous [[acc:produit_utilisable:le:la]] trouvez dans le menu **Espace [[Pl:produit]] → [[Titre:produit_utilisable:pl]]**. Chaque [[court:produit_utilisable]] possède [[acc:recette:son propre:sa propre]] [[nom:recette]] et peut être [[acc:produit_utilisable:produit:produite]], [[acc:produit_utilisable:stocké:stockée]] et [[acc:produit_utilisable:transféré:transférée]].

### Ce que vous voyez

- Une barre de filtres : **📍 [[Nom:activite]]**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ [[Nom:produit_utilisable]]**.
- Des **cartes [[nom:produit]]** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N [[nom:article:pl]] · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : [[det:activite:le:pl]]**[[Pl:activite]]** et [[det:labo:le:pl]]**[[Pl:labo]]** où [[le:produit]] est [[acc:produit:géré:gérée]].
- La pastille **📏** de l'unité finale, par exemple « 📏 kg · [[nom:recette]] 4,6 kg ».
- Un badge **⇄ [[Nom:transfert]] uniquement** sur [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]] : [[acc:produit:il:elle:pl]] ne peuvent être [[acc:produit:approvisionné:approvisionnée:pl]] en [[nom:activite]] que par [[nom:transfert]].

### Les deux modes [[de:appro]]

À la première étape de l'assistant, vous choisissez le circuit [[du:produit]] :

| Mode | Fonctionnement |
|---|---|
| 🆓 [[Court:appro:pl]] libres | [[Le:produit]] est [[acc:produit:géré:gérée]] directement dans [[le:activite:pl]] : [[nom:appro:pl]] [[acc:appro:manuel:manuelle:pl]] possibles. À l'ouverture, **[[tous:activite:les]] et [[tous:labo:les]] sont pré-cochés** — décochez pour exclure. |
| 🔒 [[Court:appro:pl]] [[acc:appro:limité:limitée:pl]] [[au:transfert:pl]] | [[Le:produit]] est **[[acc:produit:fabriqué:fabriquée]] [[acc:labo:au(x):à la/aux]] [[nomS:labo]] [[acc:labo:choisi(s):choisie(s)]]**. [[Le:activite:pl]] [[acc:activite:rattaché:rattachée:pl]] à [[ce:labo:pl]] sont [[acc:activite:pré-coché:pré-cochée:pl]] et [[acc:produit:le:la]] recevront **uniquement par [[nom:transfert]]** ; [[aucun:appro:court]] [[acc:appro:manuel:manuelle]] en [[nom:activite]]. |

En mode limité, si [[aucun:activite]] n'est [[acc:activite:coché:cochée]], [[le:produit]] reste [[au:labo]] (non [[acc:produit:distribué:distribuée]]). [[Le:article:pl]] [[acc:article:proposé:proposée:pl]] pour [[le:recette]] correspondent toujours au périmètre choisi.

### L'unité finale

Chaque [[court:produit_utilisable]] a une **unité finale** (kg, L, pièce… une unité [[du:referentiel]], menu **[[Nom:referentiel]] → Unités**) et la **quantité que donne [[son:recette]]**. Vous saisissez les quantités [[du:recette]] comme vous [[acc:recette:le:la]] faites — 2 kg de concentré de tomate, de l'eau, de l'ail… pour **4,6 kg** de sauce — et LabFlow l'enregistre **pour 1 kg** (0,435 kg de concentré pour 1 kg de sauce).

Ensuite, tout se compte dans cette unité : [[le:stock]], la production, [[le:transfert:pl]], [[le:perte:pl]], [[le:inventaire:pl]], les seuils et le coût (« pour 1 kg »). À la production, l'écran rappelle « 1 [[nom:recette]] = 4,6 kg ».

### Actions pas à pas

**Créer [[un:produit_utilisable]]**

1. Cliquez sur **+ [[Nom:produit_utilisable]]** : le même assistant en 5 étapes que pour les vendables s'ouvre (Affectation, Identité, [[Pl:article]], [[Titre:produit_utilisable:pl]], Récap).
2. À l'étape Affectation, choisissez le mode [[de:appro]] (voir tableau ci-dessus).
3. À l'étape Identité, saisissez le nom, la référence éventuelle, l'**unité finale** et la **quantité produite** (par exemple kg et 4,6) — **aucune catégorie n'est demandée** pour [[un:produit_utilisable:court]].
4. Composez [[le:recette]] **pour cette quantité** : [[nom:article:pl]] avec leurs quantités, et éventuellement d'autres [[nom:produit_utilisable:pl]] comme sous-composants, chacun dans son unité (au moins 2 composants au total).
5. Vérifiez le récapitulatif : chaque quantité y est aussi ramenée à 1 kg, c'est ce qui est enregistré. Puis validez.

À la modification, l'assistant montre de nouveau [[le:recette]] pour la quantité produite ; vous pouvez changer cette quantité.

**Ajuster les affectations** : cliquez sur les pastilles **[[Pl:activite]]** ou **[[Pl:labo]]** sous la carte pour activer ou retirer [[le:produit]] en un clic.

### À quoi servent-[[acc:produit_utilisable:ils:elles]] dans [[le:recette:pl]]

[[Un:produit_utilisable:court]] s'ajoute comme **sous-composant** d'[[un:produit_vendable]], d'un composé valorisé ou d'[[acc:produit_utilisable:un autre:une autre]] [[court:produit_utilisable]]. Son coût se répercute automatiquement partout où [[acc:produit_utilisable:il:elle]] est [[acc:produit_utilisable:utilisé:utilisée]].

:::formule Coût unitaire d'[[un:produit_utilisable]]
Coût = Σ ( [[nom:portion]] [[nom:article]] × prix unitaire ) + Σ ( [[nom:portion]] sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de [[son:recette]].
:::

### Points d'attention

:::regle
L'unité finale ne change plus dès le premier mouvement [[de:stock]] (production, [[nom:transfert]], [[nom:perte]], [[nom:inventaire]]) : ce qui est en [[nom:stock]] est compté dans cette unité. La quantité produite, elle, peut changer. [[Un:produit_utilisable:court]] [[acc:produit_utilisable:créé:créée]] avant l'arrivée de l'unité reste [[acc:produit_utilisable:compté:comptée]] **[[au:recette]]** (1 unité = 1 [[nom:recette]]) ; vous pouvez lui donner une unité tant qu'[[acc:produit_utilisable:il:elle]] n'a aucun mouvement, et [[le:recette:pl]] qui l'utilisent sont alors [[acc:recette:convertis:converties:pl]] (0,2 [[nom:recette]] → 0,92 kg).
:::

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
- [[[Nom:transfert:pl]] [[compl:labo]] → [[nom:activite:pl]]](#calc-transferts)$m237_produits_utilisables$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'produits-utilisables'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'd457a11b36912584e50d652405b1aac7';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-utilisables'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'produits-utilisables'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'produits-utilisables' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'produits-utilisables'::TEXT; END IF;
  -- ── calc-production-pt ──
  t := $m237_calc_production_pt$## 🏭 Ce que déclenche la production d'[[un:pt]]

Quand vous enregistrez la production d'[[un:pt]] — [[au:labo]] pour [[le:produit:pl]] d'origine [[nom:labo]], dans [[le:activite]] pour les autres — LabFlow écrit plusieurs mouvements [[de:stock]] en une seule opération, **tout ou rien** : si l'un échoue, rien n'est enregistré.

**Ce qui est créé** : une entrée en [[nom:stock]] [[du:produit]] [[acc:produit:fini:finie]], à la quantité produite, valorisée à son **coût [[de:recette]] du moment** ([[nom:ingredient:pl]] au PMP TTC, sous-produits inclus récursivement). Cette ligne porte [[le:fournisseur]] **AUTO** et une **référence automatique** : les initiales du nom [[du:produit]] suivies de l'année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d'un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d'[[un:pt]] est de 0 %.

**Ce qui est déduit** :

- chaque **[[nom:ingredient]]** [[du:recette]] : sortie [[de:stock]] [[de:portion]] × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** [[du:recette]] : sortie [[de:stock]] du sous-produit, valorisée à son coût [[de:recette]]. [[Le:ingredient:pl]] des sous-produits, [[acc:ingredient:eux:elles]], ont déjà été [[acc:ingredient:déduit:déduite:pl]] au moment où ces sous-produits ont été fabriqués — [[acc:ingredient:ils:elles]] ne sont pas [[acc:ingredient:déduit:déduite:pl]] une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite**, dans l'unité finale [[du:produit]] (kg, pièce…) : la saisie rappelle ce que donne [[un:recette]] [[acc:recette:entier:entière]] (« 1 [[nom:recette]] = 4,6 kg ») ; [[le:recette]] étant [[acc:recette:enregistré:enregistrée]] pour 1 unité, 9,2 kg déduisent [[le:portion:pl]] de deux [[nom:recette:pl]].
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
- [Lexique [[un:pt:pl]]](#lexique-pt)$m237_calc_production_pt$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'calc-production-pt'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ac96af6f46e37f8bc6979c510aa1d8ad';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-production-pt'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'calc-production-pt'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-production-pt' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'calc-production-pt'::TEXT; END IF;
  RAISE NOTICE '237 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m237$;
