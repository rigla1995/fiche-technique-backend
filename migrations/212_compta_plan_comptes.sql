-- LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md §1,
-- §3.7, §4 ; réponses du client du 07/10 : les dossiers déjà créés reçoivent le paquet par cette migration ; comptes de
-- 2 à 8 chiffres ; CADRAGE §7 : tout ce qui dépend du pays est une donnée du paquet pays). Migration additive : aucun
-- compte ni accès existant ne change ; compta.dossiers gagne la version du paquet qui l'a initialisé.
-- 1) Le paquet pays, versionné : Tunisie = nomenclature des comptes de la norme comptable générale NC 01 (3ᵉ partie),
--    604 comptes de 2 à 6 chiffres tirés du PDF officiel (601 de la liste + 6031, 6032, 6037 du fonctionnement du compte 603) de l'OECT (fichier relu src/compta/paquets/tn-nc01.json ; les
--    VALUES ci-dessous en sont la transcription, test/comptaS5a.test.js vérifie qu'ils disent la même chose).
--    Une nouvelle version n'écrase jamais un plan : elle s'ajoute (ref_paquets) et propose des ajouts.
CREATE TABLE IF NOT EXISTS compta.ref_paquets (
  id         SERIAL PRIMARY KEY,
  pays       CHAR(2) NOT NULL,
  version    VARCHAR(20) NOT NULL,
  libelle    VARCHAR(255) NOT NULL,
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pays, version)
);
CREATE TABLE IF NOT EXISTS compta.ref_plans (
  id            SERIAL PRIMARY KEY,
  paquet_id     INTEGER NOT NULL REFERENCES compta.ref_paquets(id) ON DELETE CASCADE,
  numero        VARCHAR(10) NOT NULL CHECK (numero ~ '^[0-9]{2,8}$'),
  libelle       VARCHAR(255) NOT NULL,
  nature        VARCHAR(20) NOT NULL,
  parent_numero VARCHAR(10),
  note          VARCHAR(500),
  UNIQUE (paquet_id, numero)
);

-- 2) Le plan de comptes d'un dossier : copie du paquet (origine « paquet », libellé de la norme gardé pour « Rétablir »)
--    puis adaptation (subdivisions : origine « ajout », explication facultative — NC 01, 3ᵉ partie §3). Un compte du
--    paquet ne se supprime jamais (actif = false) ; un compte ajouté se supprime tant qu'il n'a ni sous-compte ni
--    écriture. Le parent n'est jamais supprimé avant ses sous-comptes (le code le refuse) ; la suppression d'un dossier
--    vide emporte son plan (CASCADE : D10 ne retient que les écritures).
CREATE TABLE IF NOT EXISTS compta.comptes (
  id             SERIAL PRIMARY KEY,
  dossier_id     INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  numero         VARCHAR(10) NOT NULL CHECK (numero ~ '^[0-9]{2,8}$'),
  libelle        VARCHAR(255) NOT NULL,
  classe         SMALLINT NOT NULL CHECK (classe BETWEEN 1 AND 9),
  parent_id      INTEGER REFERENCES compta.comptes(id),
  nature         VARCHAR(20) NOT NULL DEFAULT 'general',
  origine        VARCHAR(10) NOT NULL DEFAULT 'paquet' CHECK (origine IN ('paquet', 'ajout')),
  libelle_paquet VARCHAR(255),
  note           VARCHAR(500),
  explication    VARCHAR(500),
  actif          BOOLEAN NOT NULL DEFAULT true,
  cree_par       INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_compta_comptes_parent ON compta.comptes (parent_id);
ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS paquet_id INTEGER REFERENCES compta.ref_paquets(id) ON DELETE RESTRICT;

-- 3) Le paquet Tunisie 2026.1 (idempotent : au 2e passage, rien n'est réinséré).
INSERT INTO compta.ref_paquets (pays, version, libelle, source)
VALUES ('TN', '2026.1', 'Tunisie — nomenclature des comptes de la norme comptable générale NC 01',
        'NC 01, 3e partie « Nomenclature des comptes et fonctionnement général des comptes », PDF officiel de l''OECT (https://oect.org.tn/wp-content/uploads/2023/01/NC_01.pdf), texte extrait pages 32-49')
ON CONFLICT (pays, version) DO NOTHING;
INSERT INTO compta.ref_plans (paquet_id, numero, libelle, nature, parent_numero, note)
SELECT p.id, v.numero, v.libelle, v.nature, v.parent::varchar, v.note::varchar
  FROM compta.ref_paquets p,
       (VALUES
  ('10', 'Capital', 'capitaux', NULL, NULL),
  ('101', 'Capital social', 'capitaux', '10', NULL),
  ('1011', 'Capital souscrit - non appelé', 'capitaux', '101', NULL),
  ('1012', 'Capital souscrit - appelé, non versé', 'capitaux', '101', NULL),
  ('1013', 'Capital souscrit - appelé, versé', 'capitaux', '101', NULL),
  ('10131', 'Capital non amorti', 'capitaux', '1013', NULL),
  ('10132', 'Capital amorti', 'capitaux', '1013', NULL),
  ('1018', 'Capital souscrit soumis à une réglementation particulière', 'capitaux', '101', NULL),
  ('105', 'Fonds de dotation', 'capitaux', '10', NULL),
  ('108', 'Compte de l''exploitant', 'capitaux', '10', NULL),
  ('109', 'Actionnaires, capital souscrit - non appelé', 'capitaux', '10', NULL),
  ('11', 'Réserves et primes liées au capital', 'capitaux', NULL, NULL),
  ('111', 'Réserve légale', 'capitaux', '11', NULL),
  ('112', 'Réserves statutaires', 'capitaux', '11', NULL),
  ('117', 'Primes liées au capital', 'capitaux', '11', NULL),
  ('1171', 'Primes d''émission', 'capitaux', '117', NULL),
  ('1172', 'Primes de fusion', 'capitaux', '117', NULL),
  ('1173', 'Primes d''apport', 'capitaux', '117', NULL),
  ('1174', 'Primes de conversion d''obligation', 'capitaux', '117', NULL),
  ('1178', 'Autres compléments d''apport', 'capitaux', '117', NULL),
  ('118', 'Autres réserves', 'capitaux', '11', NULL),
  ('1181', 'Réserves pour fonds social', 'capitaux', '118', NULL),
  ('119', 'Avoirs des actionnaires', 'capitaux', '11', NULL),
  ('12', 'Résultats reportés', 'capitaux', NULL, NULL),
  ('121', 'Résultats reportés', 'capitaux', '12', NULL),
  ('128', 'Modifications comptables affectant les résultats reportés', 'capitaux', '12', NULL),
  ('13', 'Résultat de l''exercice', 'capitaux', NULL, NULL),
  ('131', 'Résultat bénéficiaire', 'capitaux', '13', NULL),
  ('135', 'Résultat déficitaire', 'capitaux', '13', NULL),
  ('14', 'Autres capitaux propres', 'capitaux', NULL, NULL),
  ('141', 'Titres soumis à des réglementations particulières', 'capitaux', '14', NULL),
  ('142', 'Réserves réglementées & réserves soumises à un régime fiscal particulier', 'capitaux', '14', NULL),
  ('1421', 'Réserves indisponibles', 'capitaux', '142', NULL),
  ('143', 'Amortissements dérogatoires', 'capitaux', '14', NULL),
  ('144', 'Réserve spéciale de réévaluation', 'capitaux', '14', NULL),
  ('145', 'Subventions d''investissement', 'capitaux', '14', NULL),
  ('1451', 'Subventions d''investissement', 'capitaux', '145', NULL),
  ('1458', 'Autres subventions d''investissement', 'capitaux', '145', NULL),
  ('1459', 'Subventions d''investissement inscrites aux comptes de résultat', 'capitaux', '145', NULL),
  ('147', 'Compte du concédant', 'capitaux', '14', NULL),
  ('15', 'Provisions pour risques & charges', 'capitaux', NULL, NULL),
  ('151', 'Provisions pour risques', 'capitaux', '15', NULL),
  ('1511', 'Provisions pour litiges', 'capitaux', '151', NULL),
  ('1512', 'Provisions pour garanties données aux clients', 'capitaux', '151', NULL),
  ('1513', 'Provisions pour pertes sur marchés à achèvement futur', 'capitaux', '151', NULL),
  ('1514', 'Provisions pour amendes & pénalités', 'capitaux', '151', NULL),
  ('1515', 'Provisions pour pertes de change', 'capitaux', '151', NULL),
  ('1518', 'Autres provisions pour risques', 'capitaux', '151', NULL),
  ('152', 'Provisions pour charges à répartir sur plusieurs exercices', 'capitaux', '15', NULL),
  ('1522', 'Provisions pour grosses réparations', 'capitaux', '152', NULL),
  ('153', 'Provisions pour retraites et obligations similaires', 'capitaux', '15', NULL),
  ('154', 'Provisions d''origine réglementaire', 'capitaux', '15', NULL),
  ('155', 'Provisions pour impôts', 'capitaux', '15', NULL),
  ('156', 'Provisions pour renouvellement des immobilisations', 'capitaux', '15', NULL),
  ('157', 'Provisions pour amortissement', 'capitaux', '15', NULL),
  ('158', 'Autres provisions pour charges', 'capitaux', '15', NULL),
  ('16', 'Emprunts & dettes assimilées', 'capitaux', NULL, NULL),
  ('161', 'Emprunts obligataires (assortis de sûretés)', 'capitaux', '16', NULL),
  ('1611', 'Emprunts obligataires convertibles en actions', 'capitaux', '161', NULL),
  ('1618', 'Autres emprunts obligataires', 'capitaux', '161', NULL),
  ('162', 'Emprunts auprès des établissements financiers (assortis de sûretés)', 'capitaux', '16', NULL),
  ('1621', 'Emprunts bancaires', 'capitaux', '162', NULL),
  ('1626', 'Refinancements acquis', 'capitaux', '162', NULL),
  ('163', 'Emprunts auprès d''autres établissements financiers (assortis de sûretés)', 'capitaux', '16', NULL),
  ('164', 'Emprunts et dettes assorties de conditions particulières', 'capitaux', '16', NULL),
  ('1641', 'Avances bloquées pour augmentation du capital', 'capitaux', '164', NULL),
  ('1642', 'Avances reçues et comptes courants des associés bloqués', 'capitaux', '164', NULL),
  ('1644', 'Avances conditionnées de l''Etat & organismes internationaux', 'capitaux', '164', NULL),
  ('165', 'Emprunts non assortis de sûretés', 'capitaux', '16', 'à subdiviser selon l''ordre des comptes des emprunts'),
  ('166', 'Dettes rattachées à des participations', 'capitaux', '16', NULL),
  ('1661', 'Dettes rattachées à des participations (groupe)', 'capitaux', '166', NULL),
  ('1662', 'Dettes rattachées à des participations (hors groupe)', 'capitaux', '166', NULL),
  ('1663', 'Dettes rattachées à des sociétés en participation', 'capitaux', '166', NULL),
  ('167', 'Dépôts & cautionnements reçus', 'capitaux', '16', NULL),
  ('168', 'Autres emprunts et dettes', 'capitaux', '16', NULL),
  ('1681', 'Autres emprunts', 'capitaux', '168', NULL),
  ('1685', 'Crédit fournisseurs d''immobilisations', 'capitaux', '168', NULL),
  ('1688', 'Autres dettes non courantes', 'capitaux', '168', NULL),
  ('17', 'Comptes de liaison des établissements & succursales', 'capitaux', NULL, NULL),
  ('171', 'Comptes de liaison des établissements', 'capitaux', '17', NULL),
  ('176', 'Biens & prestations de services échangés entre établissements (charges)', 'capitaux', '17', NULL),
  ('177', 'Biens & prestations de services échangés entre établissements (produits)', 'capitaux', '17', NULL),
  ('18', 'Autres passifs non courants', 'capitaux', NULL, NULL),
  ('185', 'Écarts de conversion', 'capitaux', '18', NULL),
  ('188', 'Autres', 'capitaux', '18', NULL),
  ('21', 'Immobilisations incorporelles', 'immobilisations', NULL, NULL),
  ('211', 'Investissements de recherche & de développement', 'immobilisations', '21', NULL),
  ('212', 'Concessions de marques, brevets, licences, marques, procédés & valeurs similaires', 'immobilisations', '21', NULL),
  ('213', 'Logiciels', 'immobilisations', '21', NULL),
  ('214', 'Fonds commercial', 'immobilisations', '21', NULL),
  ('216', 'Droit au bail', 'immobilisations', '21', NULL),
  ('218', 'Autres immobilisations incorporelles', 'immobilisations', '21', NULL),
  ('22', 'Immobilisations corporelles', 'immobilisations', NULL, NULL),
  ('221', 'Terrains', 'immobilisations', '22', NULL),
  ('2213', 'Terrains nus', 'immobilisations', '221', NULL),
  ('2214', 'Terrains aménagés', 'immobilisations', '221', NULL),
  ('2215', 'Terrains bâtis', 'immobilisations', '221', NULL),
  ('2216', 'Agencements & aménagements des terrains', 'immobilisations', '221', NULL),
  ('222', 'Constructions', 'immobilisations', '22', NULL),
  ('2221', 'Bâtiments', 'immobilisations', '222', NULL),
  ('2225', 'Installations générales, agencements & aménagements des constructions', 'immobilisations', '222', NULL),
  ('2226', 'Ouvrages d''infrastructure', 'immobilisations', '222', NULL),
  ('2227', 'Constructions sur sol d''autrui', 'immobilisations', '222', NULL),
  ('223', 'Installations techniques, matériel et outillage industriels', 'immobilisations', '22', NULL),
  ('2231', 'Installations techniques', 'immobilisations', '223', NULL),
  ('2234', 'Matériel industriel', 'immobilisations', '223', NULL),
  ('2235', 'Outillage industriel', 'immobilisations', '223', NULL),
  ('2237', 'Agencements & aménagements du matériel & outillage industriels', 'immobilisations', '223', NULL),
  ('224', 'Matériel de transport', 'immobilisations', '22', NULL),
  ('2241', 'Matériel de transport de biens', 'immobilisations', '224', NULL),
  ('2244', 'Matériel de transport de personnes', 'immobilisations', '224', NULL),
  ('228', 'Autres immobilisations corporelles', 'immobilisations', '22', NULL),
  ('2281', 'Installations générales, agencements et aménagements divers', 'immobilisations', '228', NULL),
  ('2282', 'Équipement de bureau', 'immobilisations', '228', NULL),
  ('2286', 'Emballages récupérables identifiables', 'immobilisations', '228', NULL),
  ('23', 'Immobilisations en cours', 'immobilisations', NULL, NULL),
  ('231', 'Immobilisations incorporelles en cours', 'immobilisations', '23', NULL),
  ('232', 'Immobilisations corporelles en cours', 'immobilisations', '23', NULL),
  ('237', 'Avances & acomptes versés sur immobilisations incorporelles', 'immobilisations', '23', NULL),
  ('238', 'Avances & acomptes versés sur commandes d''immobilisations corporelles', 'immobilisations', '23', NULL),
  ('24', 'Immobilisations à statut juridique particulier', 'immobilisations', NULL, NULL),
  ('25', 'Participations & créances liées à des participations', 'immobilisations', NULL, NULL),
  ('251', 'Titres de participation', 'immobilisations', '25', NULL),
  ('2511', 'Actions', 'immobilisations', '251', NULL),
  ('2518', 'Autres titres', 'immobilisations', '251', NULL),
  ('256', 'Autres formes de participation', 'immobilisations', '25', NULL),
  ('257', 'Créances rattachées à des participations', 'immobilisations', '25', NULL),
  ('2571', 'Créances rattachées à des participations (groupe)', 'immobilisations', '257', NULL),
  ('2574', 'Créances rattachées à des participations (hors groupe)', 'immobilisations', '257', NULL),
  ('2575', 'Versements représentatifs d''apports non capitalisés (appel de fonds)', 'immobilisations', '257', NULL),
  ('2576', 'Avances consolidables', 'immobilisations', '257', NULL),
  ('2577', 'Autres créances rattachées à des participations', 'immobilisations', '257', NULL),
  ('258', 'Créances rattachées à des sociétés en participation', 'immobilisations', '25', NULL),
  ('259', 'Versements restant à effectuer sur titres de participation non libérés', 'immobilisations', '25', NULL),
  ('26', 'Autres immobilisations financières', 'immobilisations', NULL, NULL),
  ('261', 'Titres immobilisés (droit de propriété)', 'immobilisations', '26', NULL),
  ('2611', 'Actions', 'immobilisations', '261', NULL),
  ('2618', 'Autres titres', 'immobilisations', '261', NULL),
  ('262', 'Titres immobilisés (droit de créance)', 'immobilisations', '26', NULL),
  ('2621', 'Obligations', 'immobilisations', '262', NULL),
  ('2622', 'Bons', 'immobilisations', '262', NULL),
  ('264', 'Prêts', 'immobilisations', '26', NULL),
  ('2641', 'Prêts participatifs', 'immobilisations', '264', NULL),
  ('2642', 'Prêts aux associés', 'immobilisations', '264', NULL),
  ('2643', 'Prêts au personnel', 'immobilisations', '264', NULL),
  ('2645', 'Prêts assortis de sûretés', 'immobilisations', '264', 'à subdiviser'),
  ('2648', 'Autres prêts', 'immobilisations', '264', NULL),
  ('265', 'Dépôts et cautionnements versés', 'immobilisations', '26', NULL),
  ('2651', 'Dépôts', 'immobilisations', '265', NULL),
  ('2655', 'Cautionnements', 'immobilisations', '265', NULL),
  ('2656', 'Dépôts bancaires non courants', 'immobilisations', '265', NULL),
  ('2658', 'Autres', 'immobilisations', '265', NULL),
  ('266', 'Autres créances immobilisées', 'immobilisations', '26', NULL),
  ('2661', 'Créances immobilisées', 'immobilisations', '266', NULL),
  ('2667', 'Créances diverses', 'immobilisations', '266', NULL),
  ('2668', 'Autres créances non courantes', 'immobilisations', '266', NULL),
  ('269', 'Versements restant à effectuer sur titres immobilisés non libérés', 'immobilisations', '26', NULL),
  ('27', 'Autres actifs non courants', 'immobilisations', NULL, NULL),
  ('271', 'Frais préliminaires', 'immobilisations', '27', NULL),
  ('272', 'Charges à répartir', 'immobilisations', '27', NULL),
  ('273', 'Frais d''émission et primes de remboursement des emprunts', 'immobilisations', '27', NULL),
  ('275', 'Écarts de conversion', 'immobilisations', '27', NULL),
  ('278', 'Autres', 'immobilisations', '27', NULL),
  ('28', 'Amortissements des immobilisations', 'immobilisations', NULL, NULL),
  ('281', 'Amortissements des immobilisations incorporelles', 'immobilisations', '28', 'même ventilation que celle du compte 21'),
  ('282', 'Amortissements des immobilisations corporelles', 'immobilisations', '28', 'même ventilation que celle du compte 22'),
  ('284', 'Amortissements des immobilisations à statut juridique particulier', 'immobilisations', '28', NULL),
  ('29', 'Provisions pour dépréciation des immobilisations', 'immobilisations', NULL, NULL),
  ('291', 'Provisions pour dépréciation des immobilisations incorporelles', 'immobilisations', '29', 'même ventilation que celle du compte 21'),
  ('292', 'Provisions pour dépréciation des immobilisations corporelles', 'immobilisations', '29', 'même ventilation que celle du compte 22'),
  ('293', 'Provisions pour dépréciation des immobilisations en cours', 'immobilisations', '29', 'même ventilation que celle du compte 23'),
  ('294', 'Provisions pour dépréciation des immobilisations à statut juridique particulier', 'immobilisations', '29', NULL),
  ('295', 'Provisions pour dépréciation des participations et des créances liées à des participations', 'immobilisations', '29', 'même ventilation que celle du compte 25'),
  ('296', 'Provisions pour dépréciation des autres immobilisations financières', 'immobilisations', '29', 'même ventilation que celle du compte 26'),
  ('31', 'Matières premières & fournitures liées', 'stocks', NULL, NULL),
  ('311', 'Matières premières', 'stocks', '31', NULL),
  ('313', 'Fournitures', 'stocks', '31', NULL),
  ('317', 'Autres', 'stocks', '31', NULL),
  ('32', 'Autres approvisionnements', 'stocks', NULL, NULL),
  ('321', 'Matières consommables', 'stocks', '32', NULL),
  ('322', 'Fournitures consommables', 'stocks', '32', NULL),
  ('326', 'Emballages', 'stocks', '32', NULL),
  ('327', 'Autres', 'stocks', '32', NULL),
  ('33', 'En-cours de production de biens', 'stocks', NULL, NULL),
  ('331', 'Produits en cours', 'stocks', '33', NULL),
  ('335', 'Travaux en cours', 'stocks', '33', NULL),
  ('34', 'En-cours de production de services', 'stocks', NULL, NULL),
  ('341', 'Études en cours', 'stocks', '34', NULL),
  ('345', 'Prestations de services en cours', 'stocks', '34', NULL),
  ('35', 'Stocks de produits', 'stocks', NULL, NULL),
  ('351', 'Produits intermédiaires', 'stocks', '35', NULL),
  ('355', 'Produits finis', 'stocks', '35', NULL),
  ('357', 'Produits résiduels', 'stocks', '35', NULL),
  ('37', 'Stocks de marchandises', 'stocks', NULL, NULL),
  ('39', 'Provisions pour dépréciation des stocks', 'stocks', NULL, 'à ventiler selon la nomenclature de cette classe'),
  ('40', 'Fournisseurs & comptes rattachés', 'fournisseurs', NULL, NULL),
  ('401', 'Fournisseurs d''exploitation', 'fournisseurs', '40', NULL),
  ('4011', 'Fournisseurs - achats de biens ou de prestations de services', 'fournisseurs', '401', NULL),
  ('4017', 'Fournisseurs - retenues de garantie', 'fournisseurs', '401', NULL),
  ('403', 'Fournisseurs d''exploitation - effets à payer', 'fournisseurs', '40', NULL),
  ('404', 'Fournisseurs d''immobilisations', 'fournisseurs', '40', NULL),
  ('4041', 'Fournisseurs - achats d''immobilisations', 'fournisseurs', '404', NULL),
  ('4047', 'Fournisseurs d''immobilisations - retenues de garantie', 'fournisseurs', '404', NULL),
  ('405', 'Fournisseurs d''immobilisations - effets à payer', 'fournisseurs', '40', NULL),
  ('408', 'Fournisseurs - factures non parvenues', 'fournisseurs', '40', NULL),
  ('4081', 'Fournisseurs d''exploitation', 'fournisseurs', '408', NULL),
  ('4084', 'Fournisseurs d''immobilisations', 'fournisseurs', '408', NULL),
  ('4088', 'Fournisseurs - intérêts courus', 'fournisseurs', '408', NULL),
  ('409', 'Fournisseurs débiteurs', 'fournisseurs', '40', NULL),
  ('4091', 'Fournisseurs - avances et acomptes versés sur commandes', 'fournisseurs', '409', NULL),
  ('4096', 'Fournisseurs - créances pour emballages et matériel à rendre', 'fournisseurs', '409', NULL),
  ('4097', 'Fournisseurs - autres avoirs', 'fournisseurs', '409', NULL),
  ('40971', 'Fournisseurs d''exploitation', 'fournisseurs', '4097', NULL),
  ('40974', 'Fournisseurs d''immobilisations', 'fournisseurs', '4097', NULL),
  ('4098', 'Rabais, remises, ristournes à obtenir et autres avoirs non encore reçus', 'fournisseurs', '409', NULL),
  ('41', 'Clients & comptes rattachés', 'clients', NULL, NULL),
  ('411', 'Clients', 'clients', '41', NULL),
  ('4111', 'Clients - ventes de biens ou de prestations de services', 'clients', '411', NULL),
  ('4117', 'Clients - retenues de garantie', 'clients', '411', NULL),
  ('413', 'Clients - effets à recevoir', 'clients', '41', NULL),
  ('416', 'Clients douteux ou litigieux', 'clients', '41', NULL),
  ('417', 'Créances sur travaux non encore facturables', 'clients', '41', NULL),
  ('418', 'Clients - produits non encore facturés (produits à recevoir)', 'clients', '41', NULL),
  ('4181', 'Factures à établir', 'clients', '418', NULL),
  ('4188', 'Intérêts courus', 'clients', '418', NULL),
  ('419', 'Clients créditeurs', 'clients', '41', NULL),
  ('4191', 'Clients - avances et acomptes reçus sur commandes', 'clients', '419', NULL),
  ('4196', 'Clients - dettes pour emballages et matériel consignés', 'clients', '419', NULL),
  ('4197', 'Clients - autres avoirs', 'clients', '419', NULL),
  ('4198', 'Rabais, remises, ristournes à accorder et autres avoirs à établir', 'clients', '419', NULL),
  ('42', 'Personnel et comptes rattachés', 'personnel', NULL, NULL),
  ('421', 'Personnel - avances et acomptes', 'personnel', '42', NULL),
  ('422', 'Comités d''entreprises et autres organes représentatifs du personnel', 'personnel', '42', NULL),
  ('423', 'Personnel, œuvres sociales', 'personnel', '42', NULL),
  ('425', 'Personnel - rémunérations dues', 'personnel', '42', NULL),
  ('426', 'Personnel - dépôts', 'personnel', '42', NULL),
  ('427', 'Personnel - oppositions', 'personnel', '42', NULL),
  ('428', 'Personnel - charges à payer & produits à recevoir', 'personnel', '42', NULL),
  ('4282', 'Dettes provisionnées pour congés à payer', 'personnel', '428', NULL),
  ('4286', 'Autres charges à payer', 'personnel', '428', NULL),
  ('4287', 'Produits à recevoir', 'personnel', '428', NULL),
  ('43', 'Etat et collectivités publiques', 'etat', NULL, NULL),
  ('431', 'Etat - subventions à recevoir', 'etat', '43', NULL),
  ('432', 'Etat, impôts et taxes retenus à la source', 'retenues_operees', '43', NULL),
  ('433', 'Opérations particulières avec l''Etat, les collectivités publiques, les organismes internationaux', 'etat', '43', NULL),
  ('434', 'Etat - impôts sur les bénéfices', 'etat', '43', NULL),
  ('4341', 'Retenue à la source', 'retenues_subies', '434', NULL),
  ('4342', 'Acomptes provisionnels', 'etat', '434', NULL),
  ('4343', 'Impôt à liquider', 'etat', '434', NULL),
  ('4349', 'Impôts différés', 'etat', '434', NULL),
  ('435', 'Obligations cautionnées', 'etat', '43', NULL),
  ('436', 'Etat - taxes sur le chiffre d''affaires', 'etat', '43', NULL),
  ('4365', 'Taxes sur le chiffre d''affaires à décaisser', 'tva_a_payer', '436', NULL),
  ('43651', 'TVA à payer', 'tva_a_payer', '4365', NULL),
  ('43658', 'Autres taxes sur le chiffre d''affaires', 'etat', '4365', NULL),
  ('4366', 'Taxes sur le chiffre d''affaires déductibles', 'tva_deductible', '436', NULL),
  ('43662', 'TVA sur immobilisations', 'tva_deductible', '4366', NULL),
  ('43663', 'TVA transférée par d''autres entreprises', 'tva_deductible', '4366', NULL),
  ('43666', 'TVA sur autres biens et services', 'tva_deductible', '4366', NULL),
  ('43667', 'Crédit de TVA à reporter', 'etat', '4366', NULL),
  ('43668', 'Autres taxes sur le chiffre d''affaires', 'etat', '4366', NULL),
  ('4367', 'Taxes sur le chiffre d''affaires collectées par l''entreprise', 'tva_collectee', '436', NULL),
  ('43671', 'TVA collectée', 'tva_collectee', '4367', NULL),
  ('436711', 'TVA collectée sur les débits', 'tva_collectee', '43671', NULL),
  ('436712', 'TVA collectée sur les encaissements', 'tva_collectee', '43671', NULL),
  ('43678', 'Autres taxes sur le chiffre d''affaires', 'etat', '4367', NULL),
  ('4368', 'Taxes sur le chiffre d''affaires à régulariser ou en attente', 'etat', '436', NULL),
  ('437', 'Autres impôts, taxes et versements assimilés', 'etat', '43', NULL),
  ('438', 'Etat - charges à payer et produits à recevoir', 'etat', '43', NULL),
  ('4382', 'Charges fiscales sur congés à payer', 'etat', '438', NULL),
  ('4386', 'Autres charges à payer', 'etat', '438', NULL),
  ('4387', 'Produits à recevoir', 'etat', '438', NULL),
  ('44', 'Sociétés du groupe & associés', 'general', NULL, NULL),
  ('441', 'Groupe', 'general', '44', NULL),
  ('4411', 'Créances et intérêts courus', 'general', '441', NULL),
  ('4412', 'Dettes et intérêts à payer', 'general', '441', NULL),
  ('442', 'Associés - comptes courants', 'general', '44', NULL),
  ('4421', 'Principal', 'general', '442', NULL),
  ('4428', 'Intérêts courus', 'general', '442', NULL),
  ('446', 'Associés - opérations sur le capital', 'general', '44', NULL),
  ('447', 'Associés - dividendes à payer', 'general', '44', NULL),
  ('448', 'Associés - opérations faites en commun', 'general', '44', NULL),
  ('4481', 'Opérations courantes', 'general', '448', NULL),
  ('4488', 'Intérêts courus', 'general', '448', NULL),
  ('45', 'Débiteurs divers et Créditeurs divers', 'general', NULL, NULL),
  ('452', 'Créances sur cessions d''immobilisations', 'general', '45', NULL),
  ('453', 'Sécurité sociale et autres organismes sociaux', 'general', '45', NULL),
  ('4531', 'Organismes sociaux', 'general', '453', NULL),
  ('45311', 'CNSS', 'general', '4531', NULL),
  ('45318', 'Autres', 'general', '4531', NULL),
  ('4538', 'Organismes sociaux - charges à payer et produits à recevoir', 'general', '453', NULL),
  ('45382', 'Charges sociales sur congés à payer', 'general', '4538', NULL),
  ('45386', 'Autres charges à payer', 'general', '4538', NULL),
  ('45387', 'Produits à recevoir', 'general', '4538', NULL),
  ('454', 'Dettes sur acquisitions de valeurs mobilières de placement', 'general', '45', NULL),
  ('455', 'Créances sur cessions de valeurs mobilières de placement', 'general', '45', NULL),
  ('457', 'Autres comptes débiteurs ou créditeurs', 'general', '45', NULL),
  ('458', 'Diverses charges à payer et produits à recevoir', 'general', '45', NULL),
  ('4586', 'Charges à payer', 'general', '458', NULL),
  ('4587', 'Produits à recevoir', 'general', '458', NULL),
  ('46', 'Comptes transitoires ou d''attente', 'general', NULL, NULL),
  ('461', 'Compte d''attente', 'general', '46', NULL),
  ('465', 'Différence de conversion sur éléments courants', 'general', '46', NULL),
  ('4651', 'Différences de conversion actif', 'general', '465', NULL),
  ('4652', 'Différences de conversion passif', 'general', '465', NULL),
  ('468', 'Autres comptes transitoires', 'general', '46', NULL),
  ('47', 'Comptes de régularisation', 'general', NULL, NULL),
  ('471', 'Charges constatées d''avance', 'general', '47', NULL),
  ('472', 'Produits constatés d''avance', 'general', '47', NULL),
  ('478', 'Comptes de répartition périodique de charges et produits', 'general', '47', NULL),
  ('4786', 'Charges', 'general', '478', NULL),
  ('4787', 'Produits', 'general', '478', NULL),
  ('48', 'Provisions courantes pour risques et charges', 'general', NULL, NULL),
  ('49', 'Provisions pour dépréciation des comptes de tiers', 'general', NULL, NULL),
  ('491', 'Provisions pour dépréciation des comptes clients', 'general', '49', NULL),
  ('494', 'Provisions pour dépréciation des comptes de groupe et associés', 'general', '49', NULL),
  ('4941', 'Comptes du groupe', 'general', '494', NULL),
  ('4942', 'Comptes courants des associés', 'general', '494', NULL),
  ('4948', 'Opérations faites en commun', 'general', '494', NULL),
  ('495', 'Provisions pour dépréciation des comptes de débiteurs divers', 'general', '49', NULL),
  ('4952', 'Créances sur cession d''immobilisation', 'general', '495', NULL),
  ('4955', 'Créances sur cession des valeurs mobilières de placement', 'general', '495', NULL),
  ('4957', 'Autres comptes débiteurs', 'general', '495', NULL),
  ('50', 'Emprunts et autres dettes financières courants', 'general', NULL, NULL),
  ('501', 'Emprunts courants liés au cycle d''exploitation', 'general', '50', NULL),
  ('505', 'Échéances à moins d''un an sur emprunts non courants', 'general', '50', NULL),
  ('506', 'Concours bancaires courants', 'general', '50', NULL),
  ('5061', 'Crédit de mobilisation de créances commerciales', 'general', '506', NULL),
  ('5063', 'Mobilisation de créances nées à l''étranger', 'general', '506', NULL),
  ('5067', 'Autres concours bancaires', 'general', '506', NULL),
  ('507', 'Emprunts échus et impayés', 'general', '50', NULL),
  ('508', 'Intérêts courus', 'general', '50', 'à subdiviser selon la même ventilation que le compte 50'),
  ('51', 'Prêts et autres créances financières courants', 'general', NULL, NULL),
  ('511', 'Prêts courants liés au cycle d''exploitation', 'general', '51', NULL),
  ('516', 'Échéances à moins d''un an sur prêts non courants', 'general', '51', NULL),
  ('517', 'Échéances à moins d''un an sur autres créances financières', 'general', '51', NULL),
  ('518', 'Intérêts courus', 'general', '51', NULL),
  ('52', 'Placements courants', 'general', NULL, NULL),
  ('523', 'Actions', 'general', '52', NULL),
  ('5231', 'Titres cotés', 'general', '523', NULL),
  ('5235', 'Titres non cotés', 'general', '523', NULL),
  ('524', 'Autres titres conférant un droit de propriété', 'general', '52', NULL),
  ('525', 'Obligations et bons émis par la société et rachetés par elle', 'general', '52', NULL),
  ('526', 'Obligations', 'general', '52', NULL),
  ('5261', 'Titres cotés', 'general', '526', NULL),
  ('5265', 'Titres non cotés', 'general', '526', NULL),
  ('5266', 'Échéances à moins d''un an sur les obligations immobilisées', 'general', '526', NULL),
  ('527', 'Bons du trésor et bons de caisse à court terme', 'general', '52', NULL),
  ('528', 'Autres placements courants et créances assimilées', 'general', '52', NULL),
  ('5281', 'Autres valeurs mobilières', 'general', '528', NULL),
  ('5288', 'Intérêts courus sur obligations, bons et valeurs assimilées', 'general', '528', NULL),
  ('529', 'Versements restant à effectuer sur valeurs mobilières de placement non libérées', 'general', '52', NULL),
  ('53', 'Banques, établissements financiers et assimilés', 'general', NULL, NULL),
  ('531', 'Valeurs à l''encaissement', 'general', '53', NULL),
  ('5311', 'Coupons échus à l''encaissement', 'general', '531', NULL),
  ('5312', 'Chèques à encaisser', 'general', '531', NULL),
  ('5313', 'Effets à l''encaissement', 'general', '531', NULL),
  ('5314', 'Effets à l''escompte', 'general', '531', NULL),
  ('532', 'Banques', 'banque', '53', NULL),
  ('5321', 'Comptes en dinars', 'banque', '532', NULL),
  ('5324', 'Comptes en devises', 'banque', '532', NULL),
  ('534', 'C.C.P.', 'banque', '53', NULL),
  ('535', 'Comptes au trésor', 'banque', '53', NULL),
  ('537', 'Autres organismes financiers', 'banque', '53', NULL),
  ('54', 'Caisse', 'caisse', NULL, NULL),
  ('541', 'Caisse siège social', 'caisse', '54', NULL),
  ('5411', 'Caisse en dinars', 'caisse', '541', NULL),
  ('5414', 'Caisse en devises', 'caisse', '541', NULL),
  ('542', 'Caisses succursales', 'caisse', '54', NULL),
  ('55', 'Régies d''avances et accréditifs', 'caisse', NULL, NULL),
  ('58', 'Virements internes', 'general', NULL, NULL),
  ('59', 'Provisions pour dépréciation des comptes financiers', 'general', NULL, 'même ventilation que les comptes de la classe 5'),
  ('60', 'Achats (sauf 603)', 'charges', NULL, NULL),
  ('601', 'Achats stockés - Matières premières et fournitures liées', 'charges', '60', NULL),
  ('602', 'Achats stockés - Autres approvisionnements', 'charges', '60', NULL),
  ('6021', 'Matières consommables', 'charges', '602', NULL),
  ('6022', 'Fournitures consommables', 'charges', '602', NULL),
  ('6026', 'Emballages', 'charges', '602', NULL),
  ('603', 'Variation des stocks (approvisionnements et marchandises)', 'charges', '60', NULL),
  ('6031', 'Variation des stocks de matières premières et fournitures', 'charges', '603', NULL),
  ('6032', 'Variation des stocks des autres approvisionnements', 'charges', '603', NULL),
  ('6037', 'Variation des stocks de marchandises', 'charges', '603', NULL),
  ('604', 'Achats d''études et de prestations de services (y compris achat de sous-traitance de production)', 'charges', '60', NULL),
  ('605', 'Achats de matériel, équipements et travaux', 'charges', '60', NULL),
  ('606', 'Achats non stockés de matières et fournitures', 'charges', '60', NULL),
  ('607', 'Achats de marchandises', 'charges', '60', NULL),
  ('608', 'Achats liés à une modification comptable à prendre en compte dans le résultat de l''exercice ou à une activité abandonnée', 'charges', '60', NULL),
  ('609', 'Rabais, remises et ristournes obtenus sur achats', 'charges', '60', NULL),
  ('6098', 'Liés à une modification comptable à prendre en compte dans le résultat de l''exercice ou à une activité abandonnée', 'charges', '609', NULL),
  ('61', 'Services extérieurs', 'charges', NULL, NULL),
  ('611', 'Sous-traitance générale', 'charges', '61', NULL),
  ('612', 'Redevances pour utilisation d''immobilisations concédées', 'charges', '61', NULL),
  ('613', 'Locations (y compris malis sur emballages)', 'charges', '61', NULL),
  ('614', 'Charges locatives et de copropriété', 'charges', '61', NULL),
  ('615', 'Entretien et réparations', 'charges', '61', NULL),
  ('616', 'Primes d''assurances', 'charges', '61', NULL),
  ('617', 'Études, recherches et divers services extérieurs', 'charges', '61', NULL),
  ('618', 'Autres charges liées à une modification comptable à prendre en compte dans le résultat de l''exercice ou à une activité abandonnée', 'charges', '61', NULL),
  ('619', 'Rabais, remises et ristournes obtenus sur services extérieurs', 'charges', '61', NULL),
  ('62', 'Autres services extérieurs', 'charges', NULL, NULL),
  ('621', 'Personnel extérieur à l''entreprise', 'charges', '62', NULL),
  ('622', 'Rémunération d''intermédiaires et honoraires', 'charges', '62', NULL),
  ('623', 'Publicité, publications, relations publiques', 'charges', '62', NULL),
  ('624', 'Transports de biens et transports collectifs du personnel', 'charges', '62', NULL),
  ('6241', 'Transports sur achats', 'charges', '624', NULL),
  ('6242', 'Transports sur ventes', 'charges', '624', NULL),
  ('6244', 'Transports administratifs', 'charges', '624', NULL),
  ('6247', 'Transports collectifs du personnel', 'charges', '624', NULL),
  ('6248', 'Divers', 'charges', '624', NULL),
  ('625', 'Déplacements, missions et réceptions', 'charges', '62', NULL),
  ('6251', 'Voyages et déplacements', 'charges', '625', NULL),
  ('6255', 'Frais de déménagement', 'charges', '625', NULL),
  ('6256', 'Missions', 'charges', '625', NULL),
  ('6257', 'Réceptions', 'charges', '625', NULL),
  ('626', 'Frais postaux et frais de télécommunications', 'charges', '62', NULL),
  ('627', 'Services bancaires et assimilés', 'charges', '62', NULL),
  ('6271', 'Frais sur titres (achats, vente, garde)', 'charges', '627', NULL),
  ('6272', 'Commissions et frais sur émission d''emprunts', 'charges', '627', NULL),
  ('6275', 'Frais sur effets', 'charges', '627', NULL),
  ('6276', 'Location de coffres', 'charges', '627', NULL),
  ('6278', 'Autres frais et commissions sur prestations de services', 'charges', '627', NULL),
  ('628', 'Autres services extérieurs liés à une modification comptable à prendre en compte dans le résultat de l''exercice ou à une activité abandonnée', 'charges', '62', NULL),
  ('629', 'Rabais, remises et ristournes obtenus sur autres services extérieurs', 'charges', '62', NULL),
  ('63', 'Charges diverses ordinaires', 'charges', NULL, NULL),
  ('631', 'Redevances pour concessions de marques, brevets, licences, procédés, droits et valeurs similaires', 'charges', '63', NULL),
  ('633', 'Jetons de présence', 'charges', '63', NULL),
  ('634', 'Pertes sur créances irrécouvrables', 'charges', '63', NULL),
  ('6341', 'Créances de l''exercice', 'charges', '634', NULL),
  ('6344', 'Créances des exercices antérieurs', 'charges', '634', NULL),
  ('635', 'Quotes-parts de résultat sur opérations faites en commun', 'charges', '63', NULL),
  ('6351', 'Quote-part de bénéfice transférée (comptabilité du gérant)', 'charges', '635', NULL),
  ('6355', 'Quote-part de perte supportée (comptabilité des associés non gérants)', 'charges', '635', NULL),
  ('636', 'Charges nettes sur cessions d''immobilisations et autres pertes sur éléments non récurrents ou exceptionnels', 'charges', '63', NULL),
  ('637', 'Réduction de valeur', 'charges', '63', NULL),
  ('638', 'Charges diverses ordinaires liées à une modification comptable à prendre en compte dans le résultat de l''exercice ou à une activité abandonnée', 'charges', '63', NULL),
  ('64', 'Charges de personnel', 'charges', NULL, NULL),
  ('640', 'Salaires et compléments de salaires', 'charges', '64', NULL),
  ('6400', 'Salaires', 'charges', '640', NULL),
  ('6401', 'Heures supplémentaires', 'charges', '640', NULL),
  ('6402', 'Primes', 'charges', '640', NULL),
  ('6403', 'Gratifications', 'charges', '640', NULL),
  ('6404', 'Avantages en nature', 'charges', '640', NULL),
  ('6409', 'Autres compléments de salaires', 'charges', '640', NULL),
  ('642', 'Appointements et compléments d''appointements', 'charges', '64', NULL),
  ('6420', 'Appointements', 'charges', '642', NULL),
  ('6421', 'Heures supplémentaires', 'charges', '642', NULL),
  ('6422', 'Primes', 'charges', '642', NULL),
  ('6423', 'Gratifications', 'charges', '642', NULL),
  ('6424', 'Avantages en nature', 'charges', '642', NULL),
  ('6429', 'Autres compléments d''appointements', 'charges', '642', NULL),
  ('643', 'Indemnités représentatives de frais', 'charges', '64', NULL),
  ('644', 'Commissions au personnel', 'charges', '64', NULL),
  ('6440', 'Commissions sur achats', 'charges', '644', NULL),
  ('6441', 'Commissions sur ventes', 'charges', '644', NULL),
  ('645', 'Rémunérations des administrateurs, gérants et associés', 'charges', '64', NULL),
  ('646', 'Charges connexes aux salaires, appointements, commissions et rémunérations', 'charges', '64', NULL),
  ('6460', 'Charges connexes aux salaires', 'charges', '646', NULL),
  ('64600', 'Congés payés', 'charges', '6460', NULL),
  ('64602', 'Indemnités de préavis et de licenciements (gratification de fin de service)', 'charges', '6460', NULL),
  ('64604', 'Supplément familial', 'charges', '6460', NULL),
  ('6462', 'Charges connexes aux appointements', 'charges', '646', NULL),
  ('64620', 'Congés payés', 'charges', '6462', NULL),
  ('64622', 'Indemnités de préavis et de licenciement (gratification de fin de service)', 'charges', '6462', NULL),
  ('64624', 'Supplément familial', 'charges', '6462', NULL),
  ('6464', 'Charges connexes aux commissions', 'charges', '646', NULL),
  ('64640', 'Congés payés', 'charges', '6464', NULL),
  ('64642', 'Indemnités de préavis et de licenciement (gratification de fin de service)', 'charges', '6464', NULL),
  ('64644', 'Supplément familial', 'charges', '6464', NULL),
  ('6465', 'Charges connexes aux rémunérations des administrateurs et gérants', 'charges', '646', NULL),
  ('64650', 'Congés payés', 'charges', '6465', NULL),
  ('64652', 'Indemnités de préavis et de licenciement', 'charges', '6465', NULL),
  ('64654', 'Supplément familial', 'charges', '6465', NULL),
  ('647', 'Charges sociales légales', 'charges', '64', NULL),
  ('6470', 'Cotisations de sécurité sociale sur salaires', 'charges', '647', NULL),
  ('6472', 'Cotisations de sécurité sociale sur appointements', 'charges', '647', NULL),
  ('6474', 'Cotisations de sécurité sociale sur commissions', 'charges', '647', NULL),
  ('6475', 'Cotisations de sécurité sociale sur rémunérations des administrateurs et gérants', 'charges', '647', NULL),
  ('6476', 'Prestations directes', 'charges', '647', NULL),
  ('648', 'Charges de personnel liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'charges', '64', NULL),
  ('649', 'Autres charges de personnel et autres charges sociales', 'charges', '64', NULL),
  ('6490', 'Autres charges de personnel', 'charges', '649', NULL),
  ('6495', 'Autres charges sociales', 'charges', '649', NULL),
  ('65', 'Charges financières', 'charges', NULL, NULL),
  ('651', 'Charges d''intérêts', 'charges', '65', NULL),
  ('6511', 'Intérêts des emprunts et dettes', 'charges', '651', NULL),
  ('65116', 'Des emprunts et dettes assimilées', 'charges', '6511', NULL),
  ('65117', 'Des dettes rattachées à des participations', 'charges', '6511', NULL),
  ('6515', 'Intérêts des comptes courants et des dépôts créditeurs', 'charges', '651', NULL),
  ('6516', 'Intérêts bancaires et sur opérations de financement', 'charges', '651', NULL),
  ('6517', 'Intérêts des obligations cautionnées', 'charges', '651', NULL),
  ('6518', 'Intérêts des autres dettes (y compris les pénalités et intérêts de retard sur emprunts)', 'charges', '651', NULL),
  ('653', 'Pertes sur créances liées à des participations', 'charges', '65', NULL),
  ('654', 'Escomptes accordés', 'charges', '65', NULL),
  ('655', 'Pertes de change', 'charges', '65', NULL),
  ('656', 'Charges nettes sur cessions de valeurs mobilières', 'charges', '65', NULL),
  ('657', 'Autres charges financières', 'charges', '65', NULL),
  ('658', 'Charges financières liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'charges', '65', NULL),
  ('66', 'Impôts, taxes et versements assimilés', 'charges', NULL, NULL),
  ('661', 'Impôts, taxes et versements assimilés sur rémunérations', 'charges', '66', NULL),
  ('6611', 'TFP', 'charges', '661', NULL),
  ('6612', 'FOPROLOS', 'charges', '661', NULL),
  ('6618', 'Autres', 'charges', '661', NULL),
  ('665', 'Autres impôts, taxes et versements assimilés', 'charges', '66', NULL),
  ('6651', 'Impôts et taxes divers (sauf impôts sur les bénéfices)', 'charges', '665', NULL),
  ('6652', 'Taxes sur le chiffre d''affaires non récupérables', 'charges', '665', NULL),
  ('6654', 'Droits d''enregistrement et de timbre', 'charges', '665', NULL),
  ('6655', 'Taxes sur les véhicules', 'charges', '665', NULL),
  ('6658', 'Autres droits', 'charges', '665', NULL),
  ('668', 'Impôts et taxes liés à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'charges', '66', NULL),
  ('67', 'Pertes extraordinaires', 'charges', NULL, NULL),
  ('68', 'Dotations aux amortissements et aux provisions', 'charges', NULL, NULL),
  ('681', 'Dotations aux amortissements et aux provisions - charges ordinaires (autres que financières)', 'charges', '68', NULL),
  ('6811', 'Dotations aux amortissements des immobilisations incorporelles et corporelles', 'charges', '681', NULL),
  ('68111', 'Immobilisations incorporelles', 'charges', '6811', NULL),
  ('68112', 'Immobilisations corporelles', 'charges', '6811', NULL),
  ('6812', 'Dotations aux résorptions des charges reportées', 'charges', '681', NULL),
  ('6815', 'Dotations aux provisions pour risques et charges d''exploitation', 'charges', '681', NULL),
  ('6816', 'Dotations aux provisions pour dépréciation des immobilisations incorporelles et corporelles', 'charges', '681', NULL),
  ('68161', 'Immobilisations incorporelles', 'charges', '6816', NULL),
  ('68162', 'Immobilisations corporelles', 'charges', '6816', NULL),
  ('6817', 'Dotations aux provisions pour dépréciation des actifs courants (autres que les valeurs mobilières de placement et les équivalents de liquidités)', 'charges', '681', NULL),
  ('68173', 'Stocks et en-cours', 'charges', '6817', NULL),
  ('68174', 'Créances', 'charges', '6817', NULL),
  ('6818', 'Dotations aux amortissements et aux provisions liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'charges', '681', NULL),
  ('686', 'Dotations aux amortissements et aux provisions - charges financières', 'charges', '68', NULL),
  ('6861', 'Dotations aux amortissements des primes de remboursement des obligations', 'charges', '686', NULL),
  ('6865', 'Dotations aux provisions pour risques et charges financières', 'charges', '686', NULL),
  ('6866', 'Dotations aux provisions pour dépréciation des éléments financiers', 'charges', '686', NULL),
  ('68662', 'Immobilisations financières', 'charges', '6866', NULL),
  ('68665', 'Placements et prêts courants', 'charges', '6866', NULL),
  ('6868', 'Dotations aux amortissements et aux provisions liées à une modification comptable inscrite dans le résultat de l''exercice ou à une activité abandonnée (charges financières)', 'charges', '686', NULL),
  ('69', 'Impôts sur les bénéfices', 'charges', NULL, NULL),
  ('691', 'Impôts sur les bénéfices calculés sur le résultat des activités ordinaires', 'charges', '69', NULL),
  ('695', 'Autres impôts sur les bénéfices (régimes particuliers)', 'charges', '69', NULL),
  ('697', 'Impôts sur les bénéfices calculés sur les éléments extraordinaires', 'charges', '69', NULL),
  ('70', 'Ventes de produits fabriqués, prestations de services, marchandises', 'produits', NULL, 'À ventiler en ventes aux tiers et ventes aux filiales et entreprises associées, en ventes en dinars et ventes en devises'),
  ('701', 'Ventes de produits finis', 'produits', '70', NULL),
  ('7011', 'Produits finis achevés', 'produits', '701', NULL),
  ('7012', 'Produits finis non achevés (contrat de longue durée)', 'produits', '701', NULL),
  ('702', 'Ventes de produits intermédiaires', 'produits', '70', NULL),
  ('703', 'Ventes de produits résiduels', 'produits', '70', NULL),
  ('704', 'Travaux', 'produits', '70', NULL),
  ('705', 'Études et prestations de services', 'produits', '70', NULL),
  ('706', 'Produits des activités annexes', 'produits', '70', NULL),
  ('707', 'Ventes de marchandises', 'produits', '70', NULL),
  ('708', 'Ventes liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '70', NULL),
  ('709', 'Rabais, remises et ristournes accordés par l''entreprise', 'produits', '70', NULL),
  ('7091', 'Sur ventes de produits finis', 'produits', '709', NULL),
  ('7092', 'Sur ventes de produits intermédiaires', 'produits', '709', NULL),
  ('7094', 'Sur travaux', 'produits', '709', NULL),
  ('7095', 'Sur études et prestations de services', 'produits', '709', NULL),
  ('7096', 'Sur activités annexes', 'produits', '709', NULL),
  ('7097', 'Sur ventes de marchandises', 'produits', '709', NULL),
  ('7098', 'Sur ventes liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '709', NULL),
  ('71', 'Production stockée (ou déstockage)', 'produits', NULL, NULL),
  ('713', 'Variation des stocks (en-cours de production, produits)', 'produits', '71', NULL),
  ('7133', 'Variations des en-cours de production de biens', 'produits', '713', NULL),
  ('7134', 'Variation des en-cours de production de services', 'produits', '713', NULL),
  ('7135', 'Variation des stocks de produits', 'produits', '713', NULL),
  ('72', 'Production immobilisée', 'produits', NULL, NULL),
  ('721', 'Immobilisations incorporelles', 'produits', '72', NULL),
  ('722', 'Immobilisations corporelles', 'produits', '72', NULL),
  ('728', 'Production immobilisée liée à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '72', NULL),
  ('73', 'Produits divers ordinaires', 'produits', NULL, NULL),
  ('731', 'Redevances pour concessions, brevets, licences, marques, procédés, droits et valeurs similaires', 'produits', '73', NULL),
  ('732', 'Revenus des immeubles non affectés aux activités professionnelles', 'produits', '73', NULL),
  ('733', 'Jetons de présence et rémunérations d''administrateurs, gérants', 'produits', '73', NULL),
  ('734', 'Ristournes perçues des coopératives (provenant des excédents)', 'produits', '73', NULL),
  ('735', 'Quotes-parts de résultat sur opérations faites en commun', 'produits', '73', NULL),
  ('736', 'Produits nets sur cessions d''immobilisations et autres gains sur éléments non récurrents ou exceptionnels', 'produits', '73', NULL),
  ('738', 'Produits divers ordinaires liés à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '73', NULL),
  ('739', 'Quotes-parts des subventions d''investissement inscrites au résultat de l''exercice', 'produits', '73', NULL),
  ('74', 'Subventions d''exploitation et d''équilibre', 'produits', NULL, NULL),
  ('741', 'Subventions d''exploitation', 'produits', '74', NULL),
  ('745', 'Subventions d''équilibre', 'produits', '74', NULL),
  ('748', 'Subventions liées à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '74', NULL),
  ('75', 'Produits financiers', 'produits', NULL, NULL),
  ('751', 'Produits des participations', 'produits', '75', NULL),
  ('752', 'Produits des autres immobilisations financières', 'produits', '75', NULL),
  ('753', 'Revenus des autres créances', 'produits', '75', NULL),
  ('754', 'Revenus des valeurs mobilières de placement', 'produits', '75', NULL),
  ('755', 'Escomptes obtenus', 'produits', '75', NULL),
  ('756', 'Gains de change', 'produits', '75', NULL),
  ('757', 'Produits nets sur cessions de valeurs mobilières', 'produits', '75', NULL),
  ('758', 'Produits financiers liés à une modification comptable à imputer au résultat de l''exercice ou à une activité abandonnée', 'produits', '75', NULL),
  ('77', 'Gains extraordinaires', 'produits', NULL, NULL),
  ('78', 'Reprises sur amortissements et provisions', 'produits', NULL, NULL),
  ('781', 'Reprises sur amortissements et provisions (à inscrire dans les produits ordinaires)', 'produits', '78', NULL),
  ('7811', 'Reprises sur amortissements des immobilisations incorporelles et corporelles', 'produits', '781', NULL),
  ('78111', 'Immobilisations incorporelles', 'produits', '7811', NULL),
  ('78112', 'Immobilisations corporelles', 'produits', '7811', NULL),
  ('7815', 'Reprises sur provisions pour risques et charges d''exploitation', 'produits', '781', NULL),
  ('7816', 'Reprises sur provisions pour dépréciation des immobilisations incorporelles et corporelles', 'produits', '781', NULL),
  ('78161', 'Immobilisations incorporelles', 'produits', '7816', NULL),
  ('78162', 'Immobilisations corporelles', 'produits', '7816', NULL),
  ('7817', 'Reprises sur provisions pour dépréciation des actifs courants (autres que les valeurs mobilières de placement et les équivalents de liquidités)', 'produits', '781', NULL),
  ('78173', 'Stocks et en-cours', 'produits', '7817', NULL),
  ('78174', 'Créances', 'produits', '7817', NULL),
  ('7818', 'Reprises sur provisions liées à une modification comptable inscrite aux résultats ou à une activité abandonnée', 'produits', '781', NULL),
  ('786', 'Reprises sur provisions (à inscrire dans les produits financiers)', 'produits', '78', NULL),
  ('7865', 'Reprises sur provisions pour risque et charges financières', 'produits', '786', NULL),
  ('7866', 'Reprises sur provisions pour dépréciation des éléments financiers', 'produits', '786', NULL),
  ('7868', 'Reprises sur provisions (à inscrire dans les produits financiers) liées à une modification comptable inscrite aux résultats ou à une activité abandonnée', 'produits', '786', NULL),
  ('79', 'Transferts de charges', 'produits', NULL, 'À ventiler en fonction des comptes où ont été imputées les charges à transférer')
       ) AS v(numero, libelle, nature, parent, note)
 WHERE p.pays = 'TN' AND p.version = '2026.1'
ON CONFLICT (paquet_id, numero) DO NOTHING;

-- 4) Les dossiers déjà créés (S4, prod comprise) reçoivent le paquet de leur pays, comme un dossier neuf (réponse 2 du
--    client du 07/10) ; parents résolus par numéro ; journal « plan_initialise ». Idempotent : un dossier qui a déjà
--    un compte est laissé tel quel.
WITH paquet AS (
  SELECT id, pays, version FROM compta.ref_paquets WHERE pays = 'TN' AND version = '2026.1'
), cibles AS (
  SELECT d.id, d.espace_id, d.nom
    FROM compta.dossiers d
   WHERE d.pays = 'TN' AND NOT EXISTS (SELECT 1 FROM compta.comptes c WHERE c.dossier_id = d.id)
), inseres AS (
  INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, nature, origine, libelle_paquet, note)
  SELECT c.id, r.numero, r.libelle, LEFT(r.numero, 1)::smallint, r.nature, 'paquet', r.libelle, r.note
    FROM cibles c, paquet p
    JOIN compta.ref_plans r ON r.paquet_id = p.id
  RETURNING dossier_id
), maj AS (
  UPDATE compta.dossiers d SET paquet_id = p.id
    FROM paquet p
   WHERE d.id IN (SELECT id FROM cibles)
  RETURNING d.id
)
INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
SELECT c.espace_id, NULL, 'plan_initialise',
       jsonb_build_object('dossier', c.id, 'nom', c.nom, 'paquet', p.pays || ' ' || p.version,
                          'comptes', (SELECT COUNT(*) FROM compta.ref_plans r WHERE r.paquet_id = p.id), 'migration', 212)
  FROM cibles c, paquet p;
UPDATE compta.comptes c
   SET parent_id = p.id
  FROM compta.ref_plans r
  JOIN compta.ref_paquets q ON q.id = r.paquet_id AND q.pays = 'TN' AND q.version = '2026.1'
  JOIN compta.comptes p ON p.numero = r.parent_numero
 WHERE c.origine = 'paquet' AND c.parent_id IS NULL AND c.numero = r.numero AND r.parent_numero IS NOT NULL
   AND p.dossier_id = c.dossier_id
   AND EXISTS (SELECT 1 FROM compta.dossiers d WHERE d.id = c.dossier_id AND d.paquet_id = q.id);

-- 5) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui des migrations 209 (« Fiche du dossier ») et 211 (« Dossiers ») (garde md5 du texte par
--    défaut, sans \r) ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e
--    passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f212a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, toutes ouvertes pour l'instant. **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites.
- **Configuration** : le **plan de comptes** du dossier, avec son nombre de comptes actifs ; **Ouvrir** mène à la page **Plan de comptes** (voir sa fiche dans ce manuel). Les journaux, les taxes et les tiers arrivent aux étapes suivantes.
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
:::$f212a$, 'compta-dossier', '48b67c68c0f7b61ef548ec1e65a9fd10'),
($f212b$## 📁 Dossiers

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
Chaque dossier reçoit à sa création le plan de comptes de la norme NC 01, à adapter depuis sa fiche (voir la fiche **Plan de comptes** de ce manuel) ; les journaux, les taxes et les tiers arrivent aux étapes suivantes.
:::$f212b$, 'compta-dossiers', '4fe39b95a9f11ee59b00ae90a770fc83')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : la page « Plan de comptes » d'un dossier (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-plan-comptes', 'Plan de comptes', '📑', 1060, $f212c$## 📑 Plan de comptes

Le plan de comptes d'un dossier est la liste des comptes sur lesquels ses écritures seront passées. À la création du dossier, LabFlow Compta y copie la **nomenclature de la norme comptable générale NC 01** (plus de 600 comptes, classes 1 à 7) ; vous l'adaptez ensuite à l'entreprise. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les sept classes** (1 Capitaux propres et passifs non courants … 7 Produits), chacune dépliable ; sous chaque classe, l'arbre des comptes avec leur numéro, leur libellé et leur nature (fournisseurs, clients, banque, caisse, TVA collectée, TVA déductible…).
- **Les mentions** : **Ajouté** pour un compte créé par vous, **Renommé** quand le libellé n'est plus celui de la norme, **Désactivé** pour un compte mis de côté (affiché seulement si vous cochez **Afficher les désactivés**).
- **La recherche** : tapez un numéro ou un mot du libellé ; la liste des comptes qui correspondent (avec leur classe) remplace l'arbre, avec les mêmes actions ; **Effacer la recherche** rend l'arbre.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient le plan ; les niveaux **Saisie** et **Consultation** le consultent.

### Actions pas à pas

1. **Subdiviser un compte** : cliquez sur **Subdiviser** sur le compte parent (par exemple 532 Banques → 5321 Comptes en dinars → 53211 « BIAT »). Le numéro proposé prolonge celui du parent ; vous pouvez le changer tant qu'il commence par le numéro du parent (2 à 8 chiffres). Donnez un libellé, gardez ou changez la nature, et expliquez l'ajout si vous le souhaitez (la norme le demande, 3ᵉ partie §3).
2. **Renommer** : changez le libellé d'un compte ; **Rétablir** remet celui de la norme.
3. **Désactiver** : un compte dont vous n'avez pas l'usage sort de la saisie, sans être effacé ; ses sous-comptes doivent être désactivés avant lui. **Réactiver** le remet (son compte parent doit être actif).
4. **Supprimer** : seulement un compte que vous avez ajouté, sans sous-compte ni écriture ; un compte de la norme ne se supprime jamais, il se désactive.
5. **Exporter (Excel)** : le plan complet, à la charte LabFlow.

### Points d'attention

:::attention
Un compte qui a des écritures ne se désactive pas et ne se supprime pas. Aucune écriture n'existe encore : la saisie arrivera après la configuration du dossier (journaux, taxes, tiers aux étapes suivantes).
:::

:::astuce
Seuls les comptes sans sous-compte actif (les « feuilles » de l'arbre) recevront des écritures : subdivisez les comptes de banque (un par compte bancaire) et de caisse avant de commencer la saisie.
:::$f212c$, 'plan de comptes, comptes, nomenclature, NC 01, classe, subdiviser, sous-compte, renommer, rétablir, désactiver, réactiver, supprimer, nature, banque, caisse, fournisseurs, clients, TVA, exporter, Excel', '/plan')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
