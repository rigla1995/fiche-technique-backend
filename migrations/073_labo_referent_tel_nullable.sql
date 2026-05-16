-- Allow labos.referent_tel to be NULL (téléphone référent supprimé du formulaire)
ALTER TABLE labos ALTER COLUMN referent_tel DROP NOT NULL;
