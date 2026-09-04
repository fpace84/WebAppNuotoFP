import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { calculateCategory } from "./categories";
import { formatTime, timeToMilliseconds } from "./FormatTime";
import "./dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recordType, setRecordType] = useState("Propaganda");
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

  const renderRecordsTable = (records, gender) => {
    const filteredRecords = sortRecordsByOrder(
      records.filter((record) => record.recordType === recordType)
    );

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
          <div className="records-buttons-container">
            <button
              onClick={() => setRecordType("Propaganda")}
              className={`record-type-button-propaganda ${
                recordType === "Propaganda" ? "active propaganda" : ""
              }`}
            >
              Record Propaganda
            </button>

            <button
              onClick={() => setRecordType("Agonista")}
              className={`record-type-button-agonista ${
                recordType === "Agonista" ? "active agonista" : ""
              }`}
            >
              Record Agonistica
            </button>

            <button
              onClick={() => setRecordType("Master")}
              className={`record-type-button-master ${
                recordType === "Master" ? "active master" : ""
              }`}
            >
              Record Master
            </button>
          </div>
        </div>

        <div className="records-grid">
          {renderRecordsTable(data.stats.records.male, "male")}
          {renderRecordsTable(data.stats.records.female, "female")}
        </div>
      </section>
    </div>
  );
}
