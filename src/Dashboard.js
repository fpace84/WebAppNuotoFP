import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { calculateCategory } from "./categories";
import { formatTime, timeToMilliseconds } from "./FormatTime";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./dashboard.css";

// Menu a tendina riutilizzabile con "Seleziona tutte" + checkbox,
// con stato di apertura indipendente per ogni istanza.
function MultiSelectDropdown({ label, options, selected, onChange, emptyHint }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && selected.length === options.length;

  return (
    <div className="record-filter">
      <label className="record-filter-label">{label}</label>
      <div className="category-dropdown" ref={ref}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`category-dropdown-toggle ${isOpen ? "open" : ""}`}
        >
          <span>
            {selected.length > 0 ? `${selected.length} selezionate` : emptyHint}
          </span>
          <span className="category-dropdown-caret">▾</span>
        </button>

        {isOpen && (
          <div className="category-dropdown-panel">
            <label className="category-dropdown-item select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onChange(allSelected ? [] : [...options])}
                disabled={options.length === 0}
              />
              <span>Seleziona tutte</span>
            </label>
            <div className="category-dropdown-list">
              {options.length === 0 ? (
                <div className="category-dropdown-empty">
                  Nessuna opzione disponibile
                </div>
              ) : (
                options.map((opt) => (
                  <label
                    key={opt}
                    className={`category-dropdown-item ${
                      selected.includes(opt) ? "selected" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() =>
                        onChange(
                          selected.includes(opt)
                            ? selected.filter((v) => v !== opt)
                            : [...selected, opt]
                        )
                      }
                    />
                    <span>{opt}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recordType, setRecordType] = useState("Propaganda");
  const [recordGender, setRecordGender] = useState("all");
  const [selectedRecordCategories, setSelectedRecordCategories] = useState([]);
  const [selectedRecordStyles, setSelectedRecordStyles] = useState([]);
  const [selectedRecordDistances, setSelectedRecordDistances] = useState([]);
  const [userRole, setUserRole] = useState("user");
  const [data, setData] = useState({
    events: [],
    stats: {
      totalAthletes: 0,
      agonisti: 0,
      propaganda: 0,
      master: 0,
      totalCompetitions: 0,
      participations: 0,
      records: { male: [], female: [] },
    },
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("user_role") || "user";
      setUserRole(role);
    }
  }, []);

  const buttons = [
    {
      id: "newAthlete",
      label: "Aggiungi Nuovo Atleta",
      path: "/new-athlete",
      color: "#4F46E5",
      roles: ["admin", "coach"],
    },
    {
      id: "trainingTimes",
      label: "Registra Tempi Allenamento",
      path: "/training-times",
      color: "#059669",
      roles: ["admin", "coach"],
    },
    {
      id: "competitionResults",
      label: "Registra Tempi Gara",
      path: "/competition-results",
      color: "#7C3AED",
      roles: ["admin", "coach"],
    },
    {
      id: "athletes",
      label: "Gestione Atleti",
      path: "/athletes",
      color: "#2563EB",
      roles: ["admin", "coach", "user"],
    },
    {
      id: "competitions",
      label: "Competizioni",
      path: "/competitions",
      color: "#DB2777",
      roles: ["admin", "coach", "user"],
    },
    {
      id: "reports",
      label: "Report",
      path: "/reports",
      color: "#0D9488",
      roles: ["admin", "coach"],
    },
    {
      id: "attendance",
      label: "Gestione Presenze",
      path: "/attendance",
      color: "#F97316",
      roles: ["admin", "coach"],
    },
    {
      id: "staffetta",
      label: "Gestione Staffette",
      path: "/staffetta",
      color: "#8B5CF6",
      roles: ["admin", "coach"],
    },
  ];

  const getCategoryOrder = (category, type) => {
    const propagandaOrder = {
      "Nuoto Baby": 0,
      Esordienti: 1,
      Giovanissimi: 2,
      Allievi: 3,
      Ragazzi: 4,
      Juniores: 5,
      Cadetti: 6,
      Seniores: 7,
      "Amatori 20": 8,
      Over: 9,
    };

    const agonisticaOrder = {
      "Esordienti B": 1,
      "Esordienti A": 2,
      Ragazzi: 3,
      Juniores: 4,
      Cadetti: 5,
      Seniores: 6,
    };

    const masterOrder = {
      M20: 1,
      M25: 2,
      M30: 3,
      M35: 4,
      M40: 5,
      M45: 6,
      M50: 7,
      M55: 8,
      M60: 9,
      M65: 10,
      M70: 11,
      M75: 12,
      M80: 13,
      M85: 14,
      M90: 15,
      M95: 16,
      M100: 17,
    };

    if (type === "Propaganda") return propagandaOrder[category] || 999;
    if (type === "Agonista") return agonisticaOrder[category] || 999;
    if (type === "Master") return masterOrder[category] || 999;
    return 999;
  };

  const getTypeFromCategory = (category) => {
    const propagandaCategories = [
      "Nuoto Baby",
      "Esordienti",
      "Giovanissimi",
      "Allievi",
      "Ragazzi",
      "Juniores",
      "Cadetti",
      "Seniores",
      "Amatori 20",
      "Over",
    ];
    const agonisticaCategories = [
      "Esordienti B",
      "Esordienti A",
      "Ragazzi",
      "Juniores",
      "Cadetti",
      "Seniores",
    ];
    const masterCategories = [
      "M20",
      "M25",
      "M30",
      "M35",
      "M40",
      "M45",
      "M50",
      "M55",
      "M60",
      "M65",
      "M70",
      "M75",
      "M80",
      "M85",
      "M90",
      "M95",
      "M100",
    ];

    if (propagandaCategories.includes(category)) return "Propaganda";
    if (agonisticaCategories.includes(category)) return "Agonista";
    if (masterCategories.includes(category)) return "Master";
    return null;
  };

  const sortRecordsByOrder = (records) => {
    return records.sort((a, b) => {
      const categoryOrderA = getCategoryOrder(a.category, a.recordType);
      const categoryOrderB = getCategoryOrder(b.category, b.recordType);
      if (categoryOrderA !== categoryOrderB)
        return categoryOrderA - categoryOrderB;

      const styleOrder = {
        Farfalla: 1,
        Dorso: 2,
        Rana: 3,
        "Stile libero": 4,
        Misto: 5,
      };
      if (styleOrder[a.style] !== styleOrder[b.style]) {
        return styleOrder[a.style] - styleOrder[b.style];
      }

      return parseInt(a.distance) - parseInt(b.distance);
    });
  };

  const formatEventDates = (event) => {
    if (event.dates && Array.isArray(event.dates) && event.dates.length > 0) {
      const sortedDates = [...event.dates].sort();

      if (sortedDates.length === 1) {
        return formatDate(sortedDates[0]);
      }

      return `${formatDate(sortedDates[0])} - ${formatDate(
        sortedDates[sortedDates.length - 1]
      )}`;
    }

    return formatDate(event.date);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!db) {
          throw new Error("Errore di connessione al database");
        }

        const athletesSnapshot = await getDocs(collection(db, "athletes"));

        // Tutti gli atleti (per i record storici)
        const allAthletes = athletesSnapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));

        // Solo atleti attivi (per le statistiche)
        const activeAthletes = allAthletes.filter(
          (athlete) => !athlete.archived
        );

        const stats = {
          totalAthletes: activeAthletes.length,
          agonisti: activeAthletes.filter((a) => a.type === "Agonista").length,
          propaganda: activeAthletes.filter((a) => a.type === "Propaganda")
            .length,
          master: activeAthletes.filter((a) => a.type === "Master").length,
          totalCompetitions: 0,
          participations: 0,
          records: { male: [], female: [] },
        };

        const [competitionsSnapshot, recordsSnapshot] = await Promise.all([
          getDocs(collection(db, "races")),
          getDocs(collection(db, "competitions")),
        ]);

        stats.totalCompetitions = competitionsSnapshot.size;
        stats.participations = recordsSnapshot.size;

        const recordsByCategory = new Map();

        recordsSnapshot.docs.forEach((doc) => {
          const record = doc.data();
          // Cerca l'atleta in TUTTI gli atleti (anche archiviati/eliminati)
          const athlete = allAthletes.find((a) => a.id === record.athleteId);

          if (athlete) {
            let recordCategory;
            let recordType;

            // REGOLA FONDAMENTALE: Se il record ha già categoria e tipo salvati, USA SOLO QUELLI
            // Non ricalcolare MAI la categoria per i record esistenti
            if (record.category && record.recordType) {
              // Il record ha sia categoria che tipo salvati → USA QUELLI (sono statici)
              recordCategory = record.category;
              recordType = record.recordType;
            } else if (record.category) {
              // Il record ha la categoria salvata → deduci il tipo dalla categoria
              recordCategory = record.category;
              recordType = getTypeFromCategory(recordCategory);

              // Se non riusciamo a dedurre il tipo, prova con il tipo attuale dell'atleta
              if (!recordType) {
                recordType = athlete.type;
              }
            } else {
              // Record vecchi senza categoria salvata → usa il tipo attuale dell'atleta
              // IMPORTANTE: Questi record andrebbero aggiornati con la categoria corretta
              console.warn(
                `Record senza categoria per atleta ${athlete.name} ${athlete.lastName}`,
                record
              );

              recordCategory = calculateCategory(
                athlete.birthYear,
                athlete.type,
                athlete.gender
              );
              recordType = athlete.type;
            }

            if (!recordType || !recordCategory) {
              console.warn("Record saltato - categoria o tipo mancanti:", {
                athlete: `${athlete.name} ${athlete.lastName}`,
                category: recordCategory,
                type: recordType,
                record,
              });
              return;
            }

            // Chiave univoca: genere + categoria STATICA + stile + distanza
            const key = `${athlete.gender}-${recordCategory}-${record.style}-${record.distance}`;

            const currentTime = timeToMilliseconds(record.timeFormatted);
            const existingRecord = recordsByCategory.get(key);
            const existingTime = existingRecord
              ? timeToMilliseconds(existingRecord.timeFormatted)
              : Infinity;

            // Salva solo se questo tempo è migliore del record esistente
            if (currentTime < existingTime) {
              recordsByCategory.set(key, {
                category: recordCategory, // STATICA - non cambia mai
                recordType: recordType, // STATICO - non cambia mai
                style: record.style,
                distance: record.distance,
                athleteName: `${athlete.name} ${athlete.lastName}`,
                timeFormatted: record.timeFormatted,
                date: record.date,
                athleteId: athlete.id,
              });
            }
          } else {
            // Atleta eliminato completamente dal database
            console.warn("Record trovato ma atleta non esiste più:", record);
          }
        });

        recordsByCategory.forEach((record, key) => {
          if (key.startsWith("Maschio")) {
            stats.records.male.push(record);
          } else {
            stats.records.female.push(record);
          }
        });

        const eventsSnapshot = await getDocs(collection(db, "races"));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const futureEvents = eventsSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((event) => {
            if (
              event.dates &&
              Array.isArray(event.dates) &&
              event.dates.length > 0
            ) {
              const sortedDates = [...event.dates].sort();
              const lastDate = new Date(sortedDates[sortedDates.length - 1]);
              return lastDate >= today;
            }

            const eventDate = new Date(event.date);
            return eventDate >= today;
          })
          .sort((a, b) => {
            let dateA, dateB;

            if (a.dates && Array.isArray(a.dates) && a.dates.length > 0) {
              const sortedDatesA = [...a.dates].sort();
              dateA = new Date(sortedDatesA[0]);
            } else {
              dateA = new Date(a.date);
            }

            if (b.dates && Array.isArray(b.dates) && b.dates.length > 0) {
              const sortedDatesB = [...b.dates].sort();
              dateB = new Date(sortedDatesB[0]);
            } else {
              dateB = new Date(b.date);
            }

            return dateA - dateB;
          });

        setData({ events: futureEvents, stats });
      } catch (err) {
        console.error("Errore nel caricamento dei dati:", err);
        setError("Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDate = (date) => {
    if (!date) return "";
    try {
      if (typeof date === "string") {
        return new Date(date).toLocaleDateString("it-IT");
      }
      if (date.seconds) {
        return new Date(date.seconds * 1000).toLocaleDateString("it-IT");
      }
      if (date.toDate) {
        return date.toDate().toLocaleDateString("it-IT");
      }
      if (date instanceof Date) {
        return date.toLocaleDateString("it-IT");
      }
      return "";
    } catch {
      return "";
    }
  };

  // Applica tutti i filtri selezionati a un elenco di record
  const applyRecordFilters = (records) =>
    records.filter((record) => {
      if (record.recordType !== recordType) return false;
      if (
        selectedRecordCategories.length > 0 &&
        !selectedRecordCategories.includes(record.category)
      )
        return false;
      if (
        selectedRecordStyles.length > 0 &&
        !selectedRecordStyles.includes(record.style)
      )
        return false;
      if (
        selectedRecordDistances.length > 0 &&
        !selectedRecordDistances.includes(record.distance)
      )
        return false;
      return true;
    });

  const renderRecordsTable = (records, gender) => {
    const filteredRecords = sortRecordsByOrder(applyRecordFilters(records));

    if (filteredRecords.length === 0) {
      return (
        <div className="records-table-section">
          <h3 className="records-table-title">
            Record {gender === "male" ? "Maschili" : "Femminili"}
          </h3>
          <p className="text-center py-4 text-gray-500">
            Nessun record {recordType}{" "}
            {gender === "male" ? "maschile" : "femminile"} disponibile
          </p>
        </div>
      );
    }

    return (
      <div className="records-table-section">
        <h3 className="records-table-title">
          Record {gender === "male" ? "Maschili" : "Femminili"}
        </h3>
        <div className="records-table-container">
          <table className="records-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Atleta</th>
                <th>Stile</th>
                <th>Distanza</th>
                <th>Tempo</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, index) => (
                <tr key={index}>
                  <td>{record.category}</td>
                  <td>{record.athleteName}</td>
                  <td>{record.style}</td>
                  <td>{record.distance}</td>
                  <td className="record-time">
                    {formatTime(record.timeFormatted)}
                  </td>
                  <td>{formatDate(record.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-4 text-red-600">{error}</div>;
  }

  // Opzioni disponibili nei menu a tendina, ricavate dai record della
  // tipologia attualmente selezionata (così non si mostrano categorie o
  // distanze che non esistono per quel gruppo).
  const recordsForType = [
    ...data.stats.records.male,
    ...data.stats.records.female,
  ].filter((r) => r.recordType === recordType);

  const availableCategories = [
    ...new Set(recordsForType.map((r) => r.category).filter(Boolean)),
  ].sort();
  const availableStyles = [
    ...new Set(recordsForType.map((r) => r.style).filter(Boolean)),
  ].sort();
  const availableDistances = [
    ...new Set(recordsForType.map((r) => r.distance).filter(Boolean)),
  ].sort((a, b) => parseInt(a) - parseInt(b));

  // Righe effettivamente visibili, rispettando anche il filtro sesso
  const getVisibleSections = () => {
    const sections = [];
    if (recordGender === "all" || recordGender === "male") {
      sections.push({
        gender: "male",
        title: "Record Maschili",
        rows: sortRecordsByOrder(applyRecordFilters(data.stats.records.male)),
      });
    }
    if (recordGender === "all" || recordGender === "female") {
      sections.push({
        gender: "female",
        title: "Record Femminili",
        rows: sortRecordsByOrder(applyRecordFilters(data.stats.records.female)),
      });
    }
    return sections;
  };

  const handlePrintRecords = () => {
    window.print();
  };

  const handleSaveRecordsPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 12;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text(`Record ${recordType}`, marginX, 14);
    doc.setFont(undefined, "normal");

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    let cursorY = 30;

    const filtersSummary = [
      recordGender === "all"
        ? "Maschili e femminili"
        : recordGender === "male"
        ? "Solo maschili"
        : "Solo femminili",
      selectedRecordCategories.length > 0
        ? `Categorie: ${selectedRecordCategories.join(", ")}`
        : "Tutte le categorie",
      selectedRecordStyles.length > 0
        ? `Stili: ${selectedRecordStyles.join(", ")}`
        : "Tutti gli stili",
      selectedRecordDistances.length > 0
        ? `Distanze: ${selectedRecordDistances.join(", ")}`
        : "Tutte le distanze",
    ].join(" • ");

    const summaryLines = doc.splitTextToSize(
      filtersSummary,
      pageWidth - marginX * 2
    );
    doc.text(summaryLines, marginX, cursorY);
    cursorY += summaryLines.length * 4.5 + 4;

    getVisibleSections().forEach((section) => {
      if (section.rows.length === 0) return;

      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(section.title, marginX, cursorY);
      doc.setFont(undefined, "normal");
      cursorY += 5;

      doc.autoTable({
        startY: cursorY,
        head: [["Categoria", "Atleta", "Stile", "Distanza", "Tempo", "Data"]],
        body: section.rows.map((r) => [
          r.category || "",
          r.athleteName || "",
          r.style || "",
          r.distance || "",
          formatTime(r.timeFormatted) || "",
          formatDate(r.date) || "",
        ]),
        styles: {
          fontSize: 8,
          cellPadding: 2,
          lineColor: [225, 229, 235],
          lineWidth: 0.1,
          textColor: [55, 65, 81],
        },
        headStyles: {
          fillColor: [30, 64, 175],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
        },
        alternateRowStyles: { fillColor: [243, 246, 251] },
        theme: "striped",
        margin: { left: marginX, right: marginX, bottom: 14 },
      });

      cursorY = doc.lastAutoTable.finalY + 10;
    });

    doc.save(
      `Record_${recordType}_${new Date().toISOString().split("T")[0]}.pdf`
    );
  };

  return (
    <div className="dashboard-container">
      <div className="grid">
        {buttons
          .filter((button) => button.roles.includes(userRole))
          .map((button) => (
            <button
              key={button.id}
              onClick={() => navigate(button.path)}
              style={{ backgroundColor: button.color }}
              className="dashboard-button"
            >
              {button.label}
            </button>
          ))}
      </div>

      <section className="stats-section">
        <h2 className="stats-title">Statistiche Generali</h2>
        <div className="stats-container">
          <div className="stats-card">
            <h3>Atleti Iscritti</h3>
            <p className="stats-value">Totale: {data.stats.totalAthletes}</p>
            <p>Agonisti: {data.stats.agonisti}</p>
            <p>Propaganda: {data.stats.propaganda}</p>
            <p>Master: {data.stats.master}</p>
          </div>
          <div className="stats-card">
            <h3>Competizioni</h3>
            <p>Totale Gare: {data.stats.totalCompetitions}</p>
            <p>Partecipazioni: {data.stats.participations}</p>
          </div>
        </div>
      </section>

      <section className="events-section">
        <h2 className="events-title">Prossimi Eventi</h2>
        <div className="events-table-container">
          <table className="events-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Data</th>
                <th>Luogo</th>
                <th>Tipologia</th>
                <th>Livello</th>
              </tr>
            </thead>
            <tbody>
              {data.events.length > 0 ? (
                data.events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.name}</strong>
                      {event.subtitle && (
                        <div className="text-sm text-gray-500">
                          {event.subtitle}
                        </div>
                      )}
                    </td>
                    <td>{formatEventDates(event)}</td>
                    <td>{event.location}</td>
                    <td>
                      {Array.isArray(event.types)
                        ? event.types.join(", ")
                        : event.type}
                    </td>
                    <td>{event.level}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-4">
                    Nessun evento futuro disponibile
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="records-section">
        <div className="records-header">
          <h2 className="records-title">Record per Categoria</h2>
        </div>

        <div className="records-filters no-print">
          <div className="record-filter">
            <label className="record-filter-label">Tipologia</label>
            <select
              className="record-filter-select"
              value={recordType}
              onChange={(e) => {
                setRecordType(e.target.value);
                setSelectedRecordCategories([]);
                setSelectedRecordStyles([]);
                setSelectedRecordDistances([]);
              }}
            >
              <option value="Propaganda">Propaganda</option>
              <option value="Agonista">Agonistica</option>
              <option value="Master">Master</option>
            </select>
          </div>

          <div className="record-filter">
            <label className="record-filter-label">Sesso</label>
            <select
              className="record-filter-select"
              value={recordGender}
              onChange={(e) => setRecordGender(e.target.value)}
            >
              <option value="all">Maschi e femmine</option>
              <option value="male">Solo maschi</option>
              <option value="female">Solo femmine</option>
            </select>
          </div>

          <MultiSelectDropdown
            label="Categoria"
            options={availableCategories}
            selected={selectedRecordCategories}
            onChange={setSelectedRecordCategories}
            emptyHint="Tutte le categorie"
          />

          <MultiSelectDropdown
            label="Stile"
            options={availableStyles}
            selected={selectedRecordStyles}
            onChange={setSelectedRecordStyles}
            emptyHint="Tutti gli stili"
          />

          <MultiSelectDropdown
            label="Distanza"
            options={availableDistances}
            selected={selectedRecordDistances}
            onChange={setSelectedRecordDistances}
            emptyHint="Tutte le distanze"
          />

          <div className="records-actions">
            <button onClick={handlePrintRecords} className="record-action-btn">
              🖨️ Stampa
            </button>
            <button
              onClick={handleSaveRecordsPDF}
              className="record-action-btn pdf"
            >
              📄 Salva PDF
            </button>
          </div>
        </div>

        <div className="records-grid">
          {(recordGender === "all" || recordGender === "male") &&
            renderRecordsTable(data.stats.records.male, "male")}
          {(recordGender === "all" || recordGender === "female") &&
            renderRecordsTable(data.stats.records.female, "female")}
        </div>
      </section>
    </div>
  );
}
