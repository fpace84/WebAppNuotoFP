/**
 * Calcolo categorie nuoto - Sistema unificato per passato, presente e futuro
 */

/**
 * FUNZIONE PRINCIPALE - Calcola la categoria attuale (anno corrente)
 * Mantiene la logica originale per compatibilità con il resto dell'app
 */
export const calculateCategory = (birthYear, type, gender) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const birth = parseInt(birthYear);

  if (!birth || birth < 1900 || birth > currentYear + 1) {
    return "Anno di nascita non valido";
  }

  if (!type || !["Propaganda", "Agonista", "Master"].includes(type)) {
    return "Tipo atleta non valido";
  }

  // Stagione sportiva: da settembre inizia la nuova stagione
  const isAfterSeptember = currentMonth >= 8;
  const referenceYear = isAfterSeptember ? currentYear + 1 : currentYear;

  return calculateCategoryForYear(birth, type, gender, referenceYear);
};

/**
 * NUOVA FUNZIONE - Calcola la categoria per un anno specifico
 * Usa questa per i record storici e calcoli in qualsiasi anno
 *
 * @param {number} birthYear - Anno di nascita dell'atleta
 * @param {string} type - Tipo atleta: "Propaganda", "Agonista", "Master"
 * @param {string} gender - Genere: "Maschio", "Femmina" (richiesto per Agonista)
 * @param {number} targetYear - Anno per cui calcolare la categoria
 * @returns {string|null} Categoria nell'anno specificato, o null se non disponibile
 */
export const calculateCategoryForYear = (
  birthYear,
  type,
  gender,
  targetYear
) => {
  const birth = parseInt(birthYear);
  const year = parseInt(targetYear);

  if (!birth || birth < 1900 || !year || year < 1900) {
    return null;
  }

  if (!type || !["Propaganda", "Agonista", "Master"].includes(type)) {
    return null;
  }

  // Età che l'atleta compie/ha compiuto nell'anno specificato
  const ageInYear = year - birth;

  // === CATEGORIE MASTER ===
  if (type === "Master") {
    if (ageInYear < 20) {
      return null; // Troppo giovane per Master
    }

    const masterCategories = [
      { min: 20, max: 24, cat: "M20" },
      { min: 25, max: 29, cat: "M25" },
      { min: 30, max: 34, cat: "M30" },
      { min: 35, max: 39, cat: "M35" },
      { min: 40, max: 44, cat: "M40" },
      { min: 45, max: 49, cat: "M45" },
      { min: 50, max: 54, cat: "M50" },
      { min: 55, max: 59, cat: "M55" },
      { min: 60, max: 64, cat: "M60" },
      { min: 65, max: 69, cat: "M65" },
      { min: 70, max: 74, cat: "M70" },
      { min: 75, max: 79, cat: "M75" },
      { min: 80, max: 84, cat: "M80" },
      { min: 85, max: 89, cat: "M85" },
      { min: 90, max: 94, cat: "M90" },
      { min: 95, max: 99, cat: "M95" },
      { min: 100, max: Infinity, cat: "M100" },
    ];

    for (const category of masterCategories) {
      if (ageInYear >= category.min && ageInYear <= category.max) {
        return category.cat;
      }
    }

    return null;
  }

  // === CATEGORIE PROPAGANDA ===
  if (type === "Propaganda") {
    if (ageInYear <= 5) return "Nuoto Baby";
    if (ageInYear >= 6 && ageInYear <= 7) return "Esordienti";
    if (ageInYear >= 8 && ageInYear <= 9) return "Giovanissimi";
    if (ageInYear >= 10 && ageInYear <= 11) return "Allievi";
    if (ageInYear >= 12 && ageInYear <= 13) return "Ragazzi";
    if (ageInYear >= 14 && ageInYear <= 15) return "Juniores";
    if (ageInYear >= 16 && ageInYear <= 17) return "Cadetti";
    if (ageInYear >= 18 && ageInYear <= 19) return "Seniores";
    if (ageInYear >= 20 && ageInYear <= 24) return "Amatori 20";
    if (ageInYear >= 25) return "Over";

    return null;
  }

  // === CATEGORIE AGONISTA ===
  if (type === "Agonista") {
    if (!gender || !["Maschio", "Femmina"].includes(gender)) {
      return null;
    }

    if (gender === "Maschio") {
      if (ageInYear >= 10 && ageInYear <= 11) return "Esordienti B";
      if (ageInYear >= 12 && ageInYear <= 13) return "Esordienti A";
      if (ageInYear >= 14 && ageInYear <= 16) return "Ragazzi";
      if (ageInYear >= 17 && ageInYear <= 18) return "Juniores";
      if (ageInYear >= 19 && ageInYear <= 20) return "Cadetti";
      if (ageInYear >= 21) return "Seniores";

      return null;
    }

    if (gender === "Femmina") {
      if (ageInYear >= 9 && ageInYear <= 10) return "Esordienti B";
      if (ageInYear >= 11 && ageInYear <= 12) return "Esordienti A";
      if (ageInYear >= 13 && ageInYear <= 14) return "Ragazzi";
      if (ageInYear >= 15 && ageInYear <= 16) return "Juniores";
      if (ageInYear >= 17 && ageInYear <= 18) return "Cadetti";
      if (ageInYear >= 19) return "Seniores";

      return null;
    }
  }

  return null;
};

/**
 * Calcola la categoria per una data specifica (considera la stagione sportiva)
 * Utile quando hai una data completa e vuoi sapere la categoria in quel momento
 *
 * @param {number} birthYear - Anno di nascita
 * @param {string} type - Tipo atleta
 * @param {string} gender - Genere
 * @param {Date|string} date - Data per cui calcolare (formato Date o stringa ISO)
 * @returns {string|null} Categoria in quella data
 */
export const calculateCategoryForDate = (birthYear, type, gender, date) => {
  const targetDate = date instanceof Date ? date : new Date(date);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  // Se siamo dopo settembre, la categoria è per l'anno successivo
  const isAfterSeptember = targetMonth >= 8;
  const referenceYear = isAfterSeptember ? targetYear + 1 : targetYear;

  return calculateCategoryForYear(birthYear, type, gender, referenceYear);
};

/**
 * Determina il tipo probabile di un atleta in base all'età in un dato anno
 * Utile per record storici quando non si conosce il tipo originale
 */
export const determineProbableType = (
  birthYear,
  targetYear,
  currentType = null
) => {
  const ageInYear = targetYear - birthYear;

  if (ageInYear >= 20) {
    return "Master";
  }

  // Se conosciamo il tipo attuale e aveva più di 10 anni, manteniamo il tipo
  if (ageInYear >= 10 && currentType === "Agonista") {
    return "Agonista";
  }

  // Default: Propaganda
  return "Propaganda";
};

// === FUNZIONI DI DEBUG E TEST ===

/**
 * Debug dettagliato del calcolo categoria per un anno specifico
 */
export const debugCategoryForYear = (birthYear, type, gender, targetYear) => {
  const birth = parseInt(birthYear);
  const year = parseInt(targetYear);
  const ageInYear = year - birth;

  console.log("=== DEBUG CALCOLO CATEGORIA PER ANNO SPECIFICO ===");
  console.log(`Anno nascita: ${birth}`);
  console.log(`Anno target: ${year}`);
  console.log(`Età nell'anno ${year}: ${ageInYear} anni`);
  console.log(`Tipo atleta: ${type}`);
  console.log(`Genere: ${gender || "Non specificato"}`);
  console.log("---");

  const result = calculateCategoryForYear(birth, type, gender, year);
  console.log(`RISULTATO: ${result || "Categoria non disponibile"}`);
  console.log("================================================\n");

  return result;
};

/**
 * Test completo del sistema con esempi reali
 */
export const testCategorySystem = () => {
  console.log("=== TEST SISTEMA CATEGORIE - PASSATO, PRESENTE, FUTURO ===\n");

  const testCases = [
    {
      desc: "Atleta nato 2010 - Propaganda",
      birth: 2010,
      type: "Propaganda",
      years: [2020, 2025, 2030],
    },
    {
      desc: "Atleta nato 2014 - Agonista Femmina",
      birth: 2014,
      type: "Agonista",
      gender: "Femmina",
      years: [2020, 2025, 2030, 2035],
    },
    {
      desc: "Atleta nato 2000 - Master",
      birth: 2000,
      type: "Master",
      years: [2020, 2025, 2030, 2040, 2050],
    },
  ];

  testCases.forEach((test) => {
    console.log(`\n${test.desc}`);
    console.log("=".repeat(test.desc.length));
    test.years.forEach((year) => {
      const age = year - test.birth;
      const category = calculateCategoryForYear(
        test.birth,
        test.type,
        test.gender,
        year
      );
      console.log(`  ${year} (${age} anni): ${category || "N/A"}`);
    });
  });

  console.log("\n=== TEST RECORD STORICO ===");
  console.log("Esempio: Atleta nato 2008, ha fatto un record nel 2022");
  const recordYear = 2022;
  const athleteBirth = 2008;
  const ageAtRecord = recordYear - athleteBirth;

  console.log(`Età nel ${recordYear}: ${ageAtRecord} anni`);

  // Prova con diversi tipi
  const asPropaganda = calculateCategoryForYear(
    athleteBirth,
    "Propaganda",
    null,
    recordYear
  );
  const asAgonista = calculateCategoryForYear(
    athleteBirth,
    "Agonista",
    "Maschio",
    recordYear
  );

  console.log(`  Come Propaganda: ${asPropaganda}`);
  console.log(`  Come Agonista M: ${asAgonista}`);
  console.log(
    "\nIl record rimane nella categoria originale anche se l'atleta cambia tipo!"
  );

  console.log("\n=== VERIFICA STAGIONI ===");
  console.log("Atleta nato 2014, Agonista F");
  console.log(
    "  Marzo 2025 (stagione 2024/2025): " +
      calculateCategoryForDate(
        2014,
        "Agonista",
        "Femmina",
        new Date("2025-03-15")
      )
  );
  console.log(
    "  Settembre 2025 (stagione 2025/2026): " +
      calculateCategoryForDate(
        2014,
        "Agonista",
        "Femmina",
        new Date("2025-09-15")
      )
  );
  console.log(
    "  Marzo 2026 (stagione 2025/2026): " +
      calculateCategoryForDate(
        2014,
        "Agonista",
        "Femmina",
        new Date("2026-03-15")
      )
  );
};

// === COSTANTI ===

export const SWIMMING_STYLES = [
  "Stile libero",
  "Dorso",
  "Rana",
  "Farfalla",
  "Misto",
];

export const DISTANCES = [
  "25m",
  "50m",
  "100m",
  "200m",
  "400m",
  "800m",
  "1500m",
];

export const ATHLETE_TYPES = ["Propaganda", "Agonista", "Master"];

// === INFORMAZIONI SUL SISTEMA ===

export const SISTEMA_CATEGORIE = {
  principio:
    "L'età di appartenenza alla categoria è quella che l'atleta compie nel corso dell'anno di riferimento",
  funzioni: {
    calculateCategory:
      "Calcola la categoria attuale (considera la stagione sportiva corrente)",
    calculateCategoryForYear:
      "Calcola la categoria per un anno specifico (per record storici)",
    calculateCategoryForDate:
      "Calcola la categoria per una data specifica (considera la stagione)",
    determineProbableType:
      "Determina il tipo probabile di un atleta in base all'età",
  },
  cambio_stagione: "Settembre di ogni anno",
  record: {
    principio: "I record sono eterni e restano nella categoria originale",
    esempio:
      "Un record fatto da un atleta Propaganda rimane Propaganda anche se diventa Agonista o Master",
  },
};
