// Textes d'un PDF produit par pdfkit (flux compressés, opérateurs TJ, police Windows-1252), dans l'ordre d'écriture —
// même lecture que scripts/test-factures-identite.js et test/identiteFacture.test.js. Sert aux tests (D2 : bloc
// « FACTURÉ À » de la facture de vente selon le type de l'acheteur).
const zlib = require('zlib');

const cp1252 = new TextDecoder('windows-1252');

const textesDuPdf = (buf) => {
  const textes = [];
  const brut = buf.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(brut))) {
    const debut = m.index + m[0].length;
    const fin = brut.indexOf('endstream', debut);
    if (fin < 0) break;
    re.lastIndex = fin;
    let contenu;
    try { contenu = zlib.inflateSync(buf.subarray(debut, fin)).toString('latin1'); } catch (_) { continue; }
    for (const tj of contenu.matchAll(/\[((?:\s*<[0-9a-fA-F]*>\s*-?[0-9.]*)+)\s*\]\s*TJ/g)) {
      const hex = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]).join('');
      textes.push(cp1252.decode(Buffer.from(hex, 'hex')));
    }
  }
  return textes;
};

module.exports = { textesDuPdf };
