// Imports
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  calculateCategory,
  SWIMMING_STYLES,
  DISTANCES,
  ATHLETE_TYPES,
} from "./categories";
import { formatTime, timeToMilliseconds } from "./FormatTime";
import "./reports.css";

// Costanti per i tipi di report
const REPORT_TYPES = {
  select: "Seleziona tipo report",
  athletes: "Schede Atleti",
  training: "Tempi Allenamento",
  competition: "Tempi Gara",
  comparison: "Confronto Tempi",
  clothing: "Resoconto Abbigliamento",
  attendance: "Registro Presenze",
};

// Firestore "in" supporta al massimo 30 valori (10 nelle versioni SDK più vecchie).
// Usiamo 10 per compatibilità sicura con qualunque versione.
const FIRESTORE_IN_CHUNK_SIZE = 10;

// Normalizza qualunque formato data (Timestamp, Date, string, oggetto con toDate)
// in un oggetto Date JS, in un unico posto invece di ripetere il check ovunque.
const toJsDate = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (value.toDate && typeof value.toDate === "function") return value.toDate();
  return null;
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export default function Reports() {
  // Stati generali
  const [reportType, setReportType] = useState("select");
  const [selectedType, setSelectedType] = useState("select");
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [athleteSearch, setAthleteSearch] = useState("");

  // Stati per i dati
  const [athletes, setAthletes] = useState([]);
  const [trainingData, setTrainingData] = useState([]);
  const [competitionData, setCompetitionData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);

  // Stati per le date
  const [dateRange, setDateRange] = useState({
    start: "",
    end: "",
  });

  const [attendanceDateRange, setAttendanceDateRange] = useState({
    start: "",
    end: "",
  });
  const [categories, setCategories] = useState([]);

  // Mappa atleti per lookup O(1) invece di athletes.find() ripetuto su ogni riga
  // in ogni funzione di export (era O(N_record * N_atleti)).
  const athleteMap = useMemo(() => {
    const map = new Map();
    athletes.forEach((a) => map.set(a.id, a));
    return map;
  }, [athletes]);

  // Funzioni di utilità per formattazione e nomi
  const formatDate = (date) => {
    const dateObj = toJsDate(date);
    if (!dateObj) return "";
    try {
      return dateObj.toLocaleDateString("it-IT");
    } catch (error) {
      console.error("Errore nella formattazione della data:", error, date);
      return "";
    }
  };

  const getAthleteName = useCallback(
    (athleteId) => {
      const athlete = athleteMap.get(athleteId);
      return athlete
        ? `${athlete.name || ""} ${athlete.lastName || ""}`.trim()
        : "Atleta non trovato";
    },
    [athleteMap]
  );

  const getAthleteCategory = useCallback(
    (athleteId) => {
      const athlete = athleteMap.get(athleteId);
      if (!athlete) return "";
      return calculateCategory(athlete.birthYear, athlete.type, athlete.gender);
    },
    [athleteMap]
  );

  // Gestione selezione atleti e filtri
  const handleSelectAll = () => {
    setSelectedAthletes(
      selectedAthletes.length === filteredAthletes.length
        ? []
        : filteredAthletes.map((a) => a.id)
    );
  };

  const handleAthleteSelection = (athleteId) => {
    setSelectedAthletes((prev) =>
      prev.includes(athleteId)
        ? prev.filter((id) => id !== athleteId)
        : [...prev, athleteId]
    );
  };

  // Filtraggio atleti
  const filteredAthletes = athletes.filter((athlete) => {
    const matchesSearch = `${athlete.name} ${athlete.lastName}`
      .toLowerCase()
      .includes(athleteSearch.toLowerCase());

    const matchesType =
      selectedType === "select" ||
      selectedType === "all" ||
      athlete.type?.toLowerCase() === selectedType.toLowerCase();

    const hasClothing = reportType === "clothing" ? athlete.clothing : true;

    return matchesSearch && matchesType && hasClothing;
  });

  // useEffect hooks per caricare dati iniziali
  useEffect(() => {
    const loadAthletes = async () => {
      try {
        setLoading(true);
        setError(null);

        const athletesRef = collection(db, "athletes");
        const athletesSnapshot = await getDocs(athletesRef);

        // FIX: le letture di athleteClothing venivano fatte una alla volta,
        // in sequenza, dentro un for...of. Con N atleti erano N round-trip
        // di rete consecutivi. Promise.all le lancia tutte in parallelo:
        // il tempo totale passa da N * latenza a ~1 * latenza.
        const athletesList = await Promise.all(
          athletesSnapshot.docs.map(async (athleteDoc) => {
            const athleteData = athleteDoc.data();
            const clothingDoc = await getDoc(
              doc(db, "athleteClothing", athleteDoc.id)
            );
            const clothingData = clothingDoc.exists()
              ? clothingDoc.data()
              : null;

            const category = calculateCategory(
              athleteData.birthYear,
              athleteData.type,
              athleteData.gender
            );

            return {
              id: athleteDoc.id,
              ...athleteData,
              category,
              clothing: clothingData,
            };
          })
        );

        const sortedAthletes = athletesList.sort((a, b) => {
          if (a.lastName < b.lastName) return -1;
          if (a.lastName > b.lastName) return 1;
          return 0;
        });

        setAthletes(sortedAthletes);
      } catch (err) {
        console.error("Errore nel caricamento degli atleti:", err);
        setError("Errore nel caricamento degli atleti");
      } finally {
        setLoading(false);
      }
    };

    loadAthletes();
  }, []);

  // Effect per caricare i dati quando cambia il tipo di report o gli atleti selezionati
  useEffect(() => {
    const loadSpecificData = async () => {
      if (reportType === "select" || selectedAthletes.length === 0) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        switch (reportType) {
          case "training":
            await loadTrainingData(selectedAthletes);
            break;
          case "competition":
            await loadCompetitionData(selectedAthletes);
            break;
          case "attendance":
            await loadAttendanceData(selectedAthletes);
            break;
          case "comparison":
            await Promise.all([
              loadTrainingData(selectedAthletes),
              loadCompetitionData(selectedAthletes),
            ]);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("Errore nel caricamento dei dati specifici:", err);
        setError("Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    if (reportType !== "select" && selectedAthletes.length > 0) {
      loadSpecificData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, selectedAthletes, dateRange, attendanceDateRange]);

  // Effect per caricare le categorie quando cambia il tipo
  useEffect(() => {
    if (athletes.length > 0) {
      const availableCategories = [
        ...new Set(
          athletes
            .filter(
              (a) =>
                !selectedType ||
                selectedType === "all" ||
                a.type === selectedType
            )
            .map((a) => a.category)
        ),
      ].sort();
      setCategories(availableCategories);
    } else {
      setCategories([]);
    }
  }, [selectedType, athletes]);

  // Funzione per caricare i dati di allenamento
  //
  // FIX principale rispetto alla versione precedente:
  // 1) le query per atleta erano fatte in sequenza in un for...of -> ora sono
  //    raggruppate in batch da 10 con where(athleteId, "in", chunk) e lanciate
  //    in parallelo con Promise.all.
  // 2) il filtro sulla data veniva fatto SOLO lato client dopo aver scaricato
  //    TUTTO lo storico dell'atleta. Ora il range di date è passato anche alla
  //    query Firestore (where date >= / <=), così il server restituisce solo
  //    i documenti rilevanti. NOTA: questo richiede che il campo "date" sia
  //    salvato come Timestamp Firestore in modo consistente, e un indice
  //    composito (athleteId [in] + date [asc]) che Firestore suggerisce in
  //    console al primo errore "requires an index". Se nel tuo dataset alcuni
  //    documenti hanno "date" come stringa, quei documenti non verranno
  //    trovati dalla query server-side: in tal caso rimuovi i due where(date,...)
  //    e tieni solo il filtro client-side qui sotto come rete di sicurezza.
  const loadTrainingData = async (athleteIds) => {
    try {
      if (!dateRange.start || !dateRange.end) {
        setError("Seleziona un intervallo di date per i tempi di allenamento");
        return [];
      }

      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      const trainingRef = collection(db, "trainingTimes");
      const chunks = chunkArray(athleteIds, FIRESTORE_IN_CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          const q = query(
            trainingRef,
            where("athleteId", "in", chunk),
            where("date", ">=", startTimestamp),
            where("date", "<=", endTimestamp)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        })
      );

      let allTraining = chunkResults.flat();

      // Rete di sicurezza: se per qualche motivo un record ha una data fuori
      // range (tipo/formato inatteso), viene comunque scartato qui.
      allTraining = allTraining.filter((record) => {
        const recordDate = toJsDate(record.date);
        return recordDate && recordDate >= startDate && recordDate <= endDate;
      });

      allTraining.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

      allTraining = allTraining.map((record) => ({
        ...record,
        category: getAthleteCategory(record.athleteId),
      }));

      setTrainingData(allTraining);
      return allTraining;
    } catch (error) {
      console.error("Errore nel caricamento dei tempi di allenamento:", error);
      setError("Errore nel caricamento dei tempi di allenamento");
      return [];
    }
  };

  // Funzione per caricare i dati di competizione (stessa logica di loadTrainingData)
  const loadCompetitionData = async (athleteIds) => {
    try {
      if (!dateRange.start || !dateRange.end) {
        setError("Seleziona un intervallo di date per i tempi di gara");
        return [];
      }

      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      const competitionRef = collection(db, "competitions");
      const chunks = chunkArray(athleteIds, FIRESTORE_IN_CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          const q = query(
            competitionRef,
            where("athleteId", "in", chunk),
            where("date", ">=", startTimestamp),
            where("date", "<=", endTimestamp)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        })
      );

      let allCompetitions = chunkResults.flat();

      allCompetitions = allCompetitions.filter((record) => {
        const recordDate = toJsDate(record.date);
        if (!recordDate) {
          console.warn("Formato data non riconosciuto:", record.date);
          return false;
        }
        return recordDate >= startDate && recordDate <= endDate;
      });

      allCompetitions.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

      allCompetitions = allCompetitions.map((record) => ({
        ...record,
        category: getAthleteCategory(record.athleteId),
      }));

      setCompetitionData(allCompetitions);
      return allCompetitions;
    } catch (error) {
      console.error("Errore nel caricamento dei tempi di gara:", error);
      setError("Errore nel caricamento dei tempi di gara");
      return [];
    }
  };

  // Funzione per caricare i dati delle presenze (stessa logica)
  const loadAttendanceData = async (athleteIds) => {
    try {
      if (!attendanceDateRange.start || !attendanceDateRange.end) {
        setError("Seleziona un intervallo di date per le presenze");
        return [];
      }

      const startDate = new Date(attendanceDateRange.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(attendanceDateRange.end);
      endDate.setHours(23, 59, 59, 999);
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      const attendanceRef = collection(db, "attendance");
      const chunks = chunkArray(athleteIds, FIRESTORE_IN_CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          const q = query(
            attendanceRef,
            where("athleteId", "in", chunk),
            where("date", ">=", startTimestamp),
            where("date", "<=", endTimestamp)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        })
      );

      let allAttendance = chunkResults.flat();

      allAttendance = allAttendance.filter((record) => {
        const recordDate = toJsDate(record.date);
        if (!recordDate) {
          console.warn("Formato data presenza non riconosciuto:", record.date);
          return false;
        }
        return recordDate >= startDate && recordDate <= endDate;
      });

      allAttendance.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

      allAttendance = allAttendance.map((record) => ({
        ...record,
        category:
          record.category || getAthleteCategory(record.athleteId) || "",
      }));

      setAttendanceData(allAttendance);
      return allAttendance;
    } catch (error) {
      console.error("Errore nel caricamento delle presenze:", error);
      setError("Errore nel caricamento delle presenze");
      return [];
    }
  };

  // Funzioni di export data
  const prepareExportData = () => {
    try {
      switch (reportType) {
        case "athletes":
          return {
            columns: [
              { header: "Nome", dataKey: "name" },
              { header: "Cognome", dataKey: "lastName" },
              { header: "Tipo", dataKey: "type" },
              { header: "Anno", dataKey: "birthYear" },
              { header: "Genere", dataKey: "gender" },
              { header: "Categoria", dataKey: "category" },
            ],
            data: athletes
              .filter((a) => selectedAthletes.includes(a.id))
              .map((a) => ({
                name: a.name || "",
                lastName: a.lastName || "",
                type: a.type || "",
                birthYear: a.birthYear || "",
                gender: a.gender || "",
                category: a.category || "",
              })),
          };

        case "training":
          if (!dateRange.start || !dateRange.end) {
            throw new Error("Seleziona un intervallo di date");
          }
          if (trainingData.length === 0) {
            throw new Error(
              "Nessun dato disponibile per il periodo selezionato"
            );
          }
          return {
            columns: [
              { header: "Atleta", dataKey: "athleteName" },
              { header: "Categoria", dataKey: "category" },
              { header: "Data", dataKey: "date" },
              { header: "Stile", dataKey: "style" },
              { header: "Distanza", dataKey: "distance" },
              { header: "Tempo", dataKey: "time" },
            ],
            data: trainingData.map((t) => ({
              athleteName: t.athleteName || getAthleteName(t.athleteId),
              category: t.category || getAthleteCategory(t.athleteId),
              date: formatDate(t.date),
              style: t.style || "",
              distance: t.distance || "",
              time: formatTime(t.timeFormatted) || "",
            })),
          };

        case "competition":
          if (!dateRange.start || !dateRange.end) {
            throw new Error(
              "Seleziona un intervallo di date per i tempi di gara"
            );
          }
          if (competitionData.length === 0) {
            throw new Error(
              "Nessun dato disponibile per il periodo selezionato"
            );
          }
          return {
            columns: [
              { header: "Atleta", dataKey: "athleteName" },
              { header: "Categoria", dataKey: "category" },
              { header: "Data", dataKey: "date" },
              { header: "Competizione", dataKey: "competitionName" },
              { header: "Stile", dataKey: "style" },
              { header: "Distanza", dataKey: "distance" },
              { header: "Tempo", dataKey: "time" },
              { header: "Piazzamento", dataKey: "placement" },
            ],
            data: competitionData.map((c) => ({
              athleteName: c.athleteName || getAthleteName(c.athleteId),
              category: c.category || getAthleteCategory(c.athleteId),
              date: formatDate(c.date),
              competitionName: c.competitionName || "",
              style: c.style || "",
              distance: c.distance ? `${c.distance}` : "",
              time: formatTime(c.timeFormatted) || "",
              placement: c.placement ? `${c.placement}º` : "",
            })),
          };

        case "comparison": {
          if (!dateRange.start || !dateRange.end) {
            throw new Error(
              "Seleziona un intervallo di date per il confronto tempi"
            );
          }

          const allTimes = [...trainingData, ...competitionData].filter(
            (t) => t.athleteId && t.style && t.distance && t.timeFormatted
          );

          if (allTimes.length === 0) {
            throw new Error(
              "Nessun dato disponibile per il confronto nel periodo selezionato"
            );
          }

          const athleteStyleMap = new Map();

          allTimes.forEach((time) => {
            const key = `${time.athleteId}-${time.style}-${time.distance}`;
            if (!athleteStyleMap.has(key)) {
              athleteStyleMap.set(key, {
                athleteName: time.athleteName || getAthleteName(time.athleteId),
                category: time.category || getAthleteCategory(time.athleteId),
                style: time.style,
                distance: time.distance,
                trainingBest: null,
                competitionBest: null,
              });
            }

            const entry = athleteStyleMap.get(key);
            const isCompetition = Object.prototype.hasOwnProperty.call(
              time,
              "competitionName"
            );
            const bucketKey = isCompetition ? "competitionBest" : "trainingBest";

            if (
              !entry[bucketKey] ||
              timeToMilliseconds(time.timeFormatted) <
                timeToMilliseconds(entry[bucketKey].time)
            ) {
              entry[bucketKey] = { time: time.timeFormatted, date: time.date };
            }
          });

          const comparisonData = Array.from(athleteStyleMap.values()).map(
            (entry) => ({
              athleteName: entry.athleteName,
              category: entry.category,
              style: entry.style,
              distance: entry.distance,
              trainingTime: entry.trainingBest
                ? formatTime(entry.trainingBest.time)
                : "-",
              trainingDate: entry.trainingBest
                ? formatDate(entry.trainingBest.date)
                : "-",
              competitionTime: entry.competitionBest
                ? formatTime(entry.competitionBest.time)
                : "-",
              competitionDate: entry.competitionBest
                ? formatDate(entry.competitionBest.date)
                : "-",
            })
          );

          return {
            columns: [
              { header: "Atleta", dataKey: "athleteName" },
              { header: "Categoria", dataKey: "category" },
              { header: "Stile", dataKey: "style" },
              { header: "Distanza", dataKey: "distance" },
              { header: "Allenamento", dataKey: "trainingTime" },
              { header: "Data All", dataKey: "trainingDate" },
              { header: "Gara", dataKey: "competitionTime" },
              { header: "Data Gara", dataKey: "competitionDate" },
            ],
            data: comparisonData,
          };
        }

        case "clothing":
          return {
            columns: [
              { header: "Nome", dataKey: "name" },
              { header: "Cognome", dataKey: "lastName" },
              { header: "Tipo", dataKey: "type" },
              { header: "Categoria", dataKey: "category" },
              { header: "Articolo", dataKey: "item" },
              { header: "Taglia", dataKey: "size" },
              { header: "Quantità", dataKey: "quantity" },
              { header: "Stato", dataKey: "status" },
            ],
            data: athletes
              .filter((a) => selectedAthletes.includes(a.id))
              .flatMap((athlete) => {
                if (!athlete.clothing) return [];
                return Object.entries(athlete.clothing)
                  .filter(
                    ([key]) =>
                      key !== "athleteId" &&
                      (athlete.clothing[key]?.size ||
                        athlete.clothing[key]?.quantity > 0)
                  )
                  .map(([item, info]) => ({
                    name: athlete.name,
                    lastName: athlete.lastName,
                    type: athlete.type,
                    category: athlete.category || "",
                    item: item,
                    size:
                      info.size === "Altro" && info.customSize
                        ? info.customSize
                        : info.size,
                    quantity: info.quantity || 0,
                    status: info.delivered ? "Consegnato" : "Non consegnato",
                  }));
              }),
          };

        case "attendance":
          if (!attendanceDateRange.start || !attendanceDateRange.end) {
            throw new Error("Seleziona un intervallo di date per le presenze");
          }
          if (attendanceData.length === 0) {
            throw new Error(
              "Nessun dato di presenza disponibile per il periodo selezionato"
            );
          }
          return {
            columns: [
              { header: "Nome", dataKey: "nome" },
              { header: "Cognome", dataKey: "cognome" },
              { header: "Tipologia", dataKey: "tipologia" },
              { header: "Categoria", dataKey: "categoria" },
              { header: "Data", dataKey: "data" },
              { header: "Evento", dataKey: "evento" },
              { header: "Presenza", dataKey: "presenza" },
              { header: "Note", dataKey: "note" },
            ],
            data: attendanceData.map((record) => {
              const athlete = athleteMap.get(record.athleteId);
              return {
                nome: athlete?.name || record.athleteName?.split(" ")[0] || "",
                cognome:
                  athlete?.lastName || record.athleteName?.split(" ")[1] || "",
                tipologia: athlete?.type || "",
                categoria: record.category || (athlete ? athlete.category : ""),
                data: formatDate(record.date),
                evento:
                  record.type === "gara"
                    ? `Gara - ${record.eventName}`
                    : "Allenamento",
                presenza: record.present,
                note: record.notes || "",
              };
            }),
          };

        default:
          throw new Error(`Tipo di report non supportato: ${reportType}`);
      }
    } catch (error) {
      console.error("Errore nella preparazione dei dati:", error);
      throw error;
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      const { columns, data } = prepareExportData();

      if (!data || data.length === 0) {
        throw new Error("Nessun dato disponibile per il periodo selezionato");
      }

      doc.setFontSize(16);
      doc.text(`Report ${REPORT_TYPES[reportType]}`, 14, 15);

      doc.setFontSize(11);
      if (reportType === "attendance") {
        doc.text(
          `Periodo: ${formatDate(attendanceDateRange.start)} - ${formatDate(
            attendanceDateRange.end
          )}`,
          14,
          25
        );
      } else if (reportType !== "athletes" && reportType !== "clothing") {
        doc.text(
          `Periodo: ${formatDate(dateRange.start)} - ${formatDate(
            dateRange.end
          )}`,
          14,
          25
        );
      }

      const athletesText = athletes
        .filter((a) => selectedAthletes.includes(a.id))
        .map((a) => `${a.name} ${a.lastName} (${a.type} - ${a.category})`)
        .join(", ");

      const maxWidth = 180;
      const splitAthletes = doc.splitTextToSize(
        `Atleti: ${athletesText}`,
        maxWidth
      );
      const startY =
        reportType === "athletes" || reportType === "clothing" ? 25 : 35;
      doc.text(splitAthletes, 14, startY);

      const tableStartY = startY + splitAthletes.length * 7;

      doc.autoTable({
        startY: tableStartY,
        head: [columns.map((col) => col.header)],
        body: data.map((row) => columns.map((col) => row[col.dataKey] || "")),
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 9,
          fontStyle: "bold",
        },
        theme: "grid",
        margin: { top: tableStartY },
      });

      const fileName = `Report_${reportType}_${
        new Date().toISOString().split("T")[0]
      }.pdf`;
      doc.save(fileName);
    } catch (error) {
      throw new Error(error.message || "Errore durante la generazione del PDF");
    }
  };

  // Export to Excel
  const exportToExcel = async () => {
    try {
      const { columns, data } = prepareExportData();

      if (!data || data.length === 0) {
        throw new Error("Nessun dato disponibile per il periodo selezionato");
      }

      const headerRows = [
        [`Report ${REPORT_TYPES[reportType]}`],
        reportType === "attendance"
          ? [
              `Periodo: ${formatDate(attendanceDateRange.start)} - ${formatDate(
                attendanceDateRange.end
              )}`,
            ]
          : reportType !== "athletes" && reportType !== "clothing"
          ? [
              `Periodo: ${formatDate(dateRange.start)} - ${formatDate(
                dateRange.end
              )}`,
            ]
          : [],
        [
          `Atleti: ${athletes
            .filter((a) => selectedAthletes.includes(a.id))
            .map((a) => `${a.name} ${a.lastName} (${a.type} - ${a.category})`)
            .join(", ")}`,
        ],
        [""],
        columns.map((col) => col.header),
      ];

      const excelData = data.map((row) =>
        columns.map((col) => row[col.dataKey] || "")
      );

      const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...excelData]);

      const colWidths = columns.map(() => ({ wch: 20 }));
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");

      const fileName = `Report_${reportType}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      throw new Error(
        error.message || "Errore durante la generazione del file Excel"
      );
    }
  };

  // Funzione per generare il report
  const handleExport = async (type) => {
    if (reportType === "select" || selectedAthletes.length === 0) {
      alert("Seleziona un tipo di report e almeno un atleta");
      return;
    }

    setIsExporting(true);
    try {
      if (reportType === "competition" && competitionData.length === 0) {
        await loadCompetitionData(selectedAthletes);
      } else if (reportType === "attendance" && attendanceData.length === 0) {
        await loadAttendanceData(selectedAthletes);
      } else if (
        reportType === "comparison" &&
        (trainingData.length === 0 || competitionData.length === 0)
      ) {
        // FIX: questi due caricamenti erano indipendenti tra loro (uno usa
        // trainingTimes, l'altro competitions) quindi possono partire insieme.
        await Promise.all([
          trainingData.length === 0
            ? loadTrainingData(selectedAthletes)
            : Promise.resolve(),
          competitionData.length === 0
            ? loadCompetitionData(selectedAthletes)
            : Promise.resolve(),
        ]);
      }

      if (type === "pdf") {
        await exportToPDF();
      } else {
        await exportToExcel();
      }
    } catch (error) {
      console.error("Errore durante l'export:", error);
      alert(error.message || "Errore durante l'export");
    } finally {
      setIsExporting(false);
    }
  };

  // Component UI return statement
  return (
    <div className="p-6 max-w-6xl mx-auto bg-white rounded-xl shadow-md">
      {/* Header con titolo e pulsanti export */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Report e Statistiche
        </h1>

        <div className="flex space-x-4">
          <button
            onClick={() => handleExport("pdf")}
            disabled={
              isExporting ||
              reportType === "select" ||
              selectedAthletes.length === 0
            }
            className="flex items-center px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <FileText className="h-5 w-5 mr-2" />
            )}
            {isExporting ? "Esportazione..." : "Esporta PDF"}
          </button>

          <button
            onClick={() => handleExport("excel")}
            disabled={
              isExporting ||
              reportType === "select" ||
              selectedAthletes.length === 0
            }
            className="flex items-center px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-5 w-5 mr-2" />
            )}
            {isExporting ? "Esportazione..." : "Esporta Excel"}
          </button>
        </div>
      </div>

      {/* Form di filtri */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Tipo Report */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo Report
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            disabled={isExporting}
          >
            {Object.entries(REPORT_TYPES).map(([value, label]) => (
              <option key={value} value={value} disabled={value === "select"}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Date fields */}
        {reportType !== "athletes" && reportType !== "clothing" && (
          <>
            {reportType === "attendance" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Inizio Presenze
                  </label>
                  <input
                    type="date"
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={attendanceDateRange.start}
                    onChange={(e) =>
                      setAttendanceDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    disabled={isExporting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Fine Presenze
                  </label>
                  <input
                    type="date"
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={attendanceDateRange.end}
                    onChange={(e) =>
                      setAttendanceDateRange((prev) => ({
                        ...prev,
                        end: e.target.value,
                      }))
                    }
                    disabled={isExporting}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Inizio
                  </label>
                  <input
                    type="date"
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    disabled={isExporting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Fine
                  </label>
                  <input
                    type="date"
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    disabled={isExporting}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* Tipologia Atleti */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipologia Atleti
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            disabled={isExporting}
          >
            <option value="select">Seleziona tipologia</option>
            <option value="all">Tutte le tipologie</option>
            {ATHLETE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Selezione Atleti con Ricerca */}
        <div className="mb-8 col-span-2">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Seleziona Atleti
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Cerca atleta..."
                value={athleteSearch}
                onChange={(e) => setAthleteSearch(e.target.value)}
                className="text-sm border rounded px-3 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={isExporting}
              />
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed px-2"
                disabled={isExporting || filteredAthletes.length === 0}
              >
                {selectedAthletes.length === filteredAthletes.length
                  ? "Deseleziona tutti"
                  : "Seleziona tutti"}
              </button>
            </div>
          </div>

          {/* Griglia Atleti */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-2">
            {loading && athletes.length === 0 ? (
              <div className="col-span-full flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span>Caricamento atleti...</span>
              </div>
            ) : filteredAthletes.length === 0 ? (
              <div className="col-span-full p-4 text-center text-gray-500">
                Nessun atleta trovato
              </div>
            ) : (
              filteredAthletes.map((athlete) => (
                <div
                  key={athlete.id}
                  className={`
                 flex items-center p-2 rounded cursor-pointer
                 ${
                   selectedAthletes.includes(athlete.id)
                     ? "bg-blue-50"
                     : "hover:bg-gray-50"
                 }
               `}
                  onClick={() => handleAthleteSelection(athlete.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedAthletes.includes(athlete.id)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm">
                    {athlete.lastName} {athlete.name}
                    <span className="text-xs text-gray-500 ml-1">
                      ({athlete.category})
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {selectedAthletes.length} atleti selezionati
          </p>
        </div>
      </div>

      {/* Feedback periodo selezionato */}
      {(dateRange.start && dateRange.end) ||
      (attendanceDateRange.start && attendanceDateRange.end) ? (
        <div className="mt-4 bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-blue-500 mr-2" />
            <p className="text-sm text-blue-700">
              {reportType === "attendance" ? (
                <>
                  Periodo selezionato: dal{" "}
                  {formatDate(attendanceDateRange.start)} al{" "}
                  {formatDate(attendanceDateRange.end)}
                </>
              ) : (
                <>
                  {reportType === "clothing" || reportType === "athletes" ? (
                    <>
                      Report {REPORT_TYPES[reportType]} - Tipologia:{" "}
                      <span className="font-medium">
                        {selectedType === "all"
                          ? "Tutte le tipologie"
                          : selectedType === "select"
                          ? "Seleziona tipologia"
                          : selectedType}
                      </span>
                    </>
                  ) : (
                    `Periodo: dal ${formatDate(
                      dateRange.start
                    )} al ${formatDate(dateRange.end)}`
                  )}
                </>
              )}
            </p>
          </div>
          {selectedAthletes.length > 0 && (
            <p className="text-sm text-blue-700 ml-7">
              Atleti selezionati:{" "}
              {athletes
                .filter((a) => selectedAthletes.includes(a.id))
                .map((a) => `${a.name} ${a.lastName} (${a.category})`)
                .join(", ")}
            </p>
          )}
        </div>
      ) : null}

      {/* Error display */}
      {error && (
        <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {(loading || isExporting) && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg flex items-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>
              {isExporting ? "Esportazione in corso..." : "Caricamento dati..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}