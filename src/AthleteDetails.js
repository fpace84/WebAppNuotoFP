import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { calculateCategory } from "./categories";
import "./athleteDetails.css";
import { formatTime, timeToMilliseconds } from "./FormatTime";

export default function AthleteDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Stati per i dati
  const [athlete, setAthlete] = useState(null);
  const [category, setCategory] = useState("");
  const [trainingTimes, setTrainingTimes] = useState([]);
  const [competitionResults, setCompetitionResults] = useState([]);
  const [clothingInfo, setClothingInfo] = useState({});
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // Stati UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Stati modifica tempi
  const [editingTraining, setEditingTraining] = useState(null);
  const [editingCompetition, setEditingCompetition] = useState(null);

  // Stati utente
  const [userRole, setUserRole] = useState("");
  const [userChildInfo, setUserChildInfo] = useState(null);

  // Stati filtri
  const [attendanceFilter, setAttendanceFilter] = useState({
    type: "all",
    startDate: "",
    endDate: "",
  });

  // Espansioni tabelle
  const [showAllTraining, setShowAllTraining] = useState(false);
  const [showAllCompetitions, setShowAllCompetitions] = useState(false);

  // Filtri tempi/gare
  const [trainingFilter, setTrainingFilter] = useState({
    style: "all",
    distance: "all",
  });
  const [competitionFilter, setCompetitionFilter] = useState({
    style: "all",
    distance: "all",
  });

  // Costanti
  const monthNames = [
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];

  const toDateObject = (value) => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!isNaN(parsed)) return parsed;
    return null;
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = toDateObject(date);
    if (!d) return "";
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getPresenceText = (presence) => {
    if (!presence) return "";
    switch (presence.present) {
      case "Presente":
        return "P";
      case "Assente":
        return "A";
      case "Assente Giustificato":
        return "AG";
      case "Ritardo":
        return "R";
      case "Uscita Anticipata":
        return "UA";
      default:
        return "";
    }
  };

  // Caricamento dati
  useEffect(() => {
    const loadAthleteData = async () => {
      try {
        setLoading(true);
        setError("");

        const userId = localStorage.getItem("auth_token");
        const role = localStorage.getItem("user_role");
        setUserRole(role);

        const athleteDoc = await getDoc(doc(db, "athletes", id));
        if (!athleteDoc.exists()) {
          setError("Atleta non trovato");
          setLoading(false);
          return;
        }

        const athleteData = athleteDoc.data();

        if (role === "user") {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserChildInfo({
              name: userData.childName,
              lastName: userData.childLastName,
            });
            if (
              athleteData.name !== userData.childName ||
              athleteData.lastName !== userData.childLastName
            ) {
              navigate("/unauthorized");
              return;
            }
          }
        }

        const calculatedCategory = calculateCategory(
          athleteData.birthYear,
          athleteData.type,
          athleteData.gender
        );
        setAthlete({ id: athleteDoc.id, ...athleteData });
        setCategory(calculatedCategory);

        // Tempi allenamento
        const trainingQuery = query(
          collection(db, "trainingTimes"),
          where("athleteId", "==", id)
        );
        const trainingSnapshot = await getDocs(trainingQuery);
        const trainingData = trainingSnapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              date: toDateObject(data.date),
            };
          })
          .sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return b.date - a.date;
          });
        setTrainingTimes(trainingData);

        // Risultati gare
        const competitionQuery = query(
          collection(db, "competitions"),
          where("athleteId", "==", id)
        );
        const competitionSnapshot = await getDocs(competitionQuery);
        const competitionData = competitionSnapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              date: toDateObject(data.date),
            };
          })
          .sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return b.date - a.date;
          });
        setCompetitionResults(competitionData);

        // Abbigliamento
        const clothingDoc = await getDoc(doc(db, "athleteClothing", id));
        if (clothingDoc.exists()) setClothingInfo(clothingDoc.data());

        // Presenze
        const attendanceQuery = query(
          collection(db, "attendance"),
          where("athleteId", "==", id)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        const attendanceData = attendanceSnapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              date: toDateObject(data.date),
            };
          })
          .sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return b.date - a.date;
          });
        setAttendanceRecords(attendanceData);
      } catch (err) {
        console.error("Errore nel caricamento dei dati:", err);
        setError("Errore nel caricamento dei dati dell'atleta");
      } finally {
        setLoading(false);
      }
    };

    loadAthleteData();
  }, [id, navigate]);

  // Funzioni per modificare tempi allenamento
  const handleEditTraining = (training) => {
    setEditingTraining({ ...training });
  };

  const handleSaveTraining = async () => {
    try {
      const trainingRef = doc(db, "trainingTimes", editingTraining.id);
      await updateDoc(trainingRef, {
        style: editingTraining.style,
        distance: editingTraining.distance,
        timeFormatted: editingTraining.timeFormatted,
        date: editingTraining.date,
      });

      // Aggiorna lo stato locale
      setTrainingTimes((prev) =>
        prev.map((t) => (t.id === editingTraining.id ? editingTraining : t))
      );

      setEditingTraining(null);
      alert("Tempo di allenamento aggiornato con successo!");
    } catch (err) {
      console.error("Errore nel salvataggio:", err);
      alert("Errore nel salvataggio del tempo");
    }
  };

  // Funzioni per modificare risultati gare
  const handleEditCompetition = (competition) => {
    setEditingCompetition({ ...competition });
  };

  const handleSaveCompetition = async () => {
    try {
      const competitionRef = doc(db, "competitions", editingCompetition.id);
      await updateDoc(competitionRef, {
        style: editingCompetition.style,
        distance: editingCompetition.distance,
        timeFormatted: editingCompetition.timeFormatted,
        competitionName: editingCompetition.competitionName,
        placement: editingCompetition.placement,
        date: editingCompetition.date,
      });

      // Aggiorna lo stato locale
      setCompetitionResults((prev) =>
        prev.map((c) =>
          c.id === editingCompetition.id ? editingCompetition : c
        )
      );

      setEditingCompetition(null);
      alert("Risultato di gara aggiornato con successo!");
    } catch (err) {
      console.error("Errore nel salvataggio:", err);
      alert("Errore nel salvataggio del risultato");
    }
  };

  // Filtri
  const getFilteredAttendanceRecords = () => {
    return attendanceRecords.filter((record) => {
      const recordDate = toDateObject(record.date);
      if (!recordDate) return false;
      const matchesType =
        attendanceFilter.type === "all" ||
        record.type === attendanceFilter.type;
      const matchesDateRange =
        (!attendanceFilter.startDate ||
          recordDate >= new Date(attendanceFilter.startDate)) &&
        (!attendanceFilter.endDate ||
          recordDate <= new Date(attendanceFilter.endDate));
      return matchesType && matchesDateRange;
    });
  };

  const getFilteredTrainingTimes = () => {
    return trainingTimes.filter((time) => {
      const matchesStyle =
        trainingFilter.style === "all" || time.style === trainingFilter.style;
      const matchesDistance =
        trainingFilter.distance === "all" ||
        time.distance === trainingFilter.distance;
      return matchesStyle && matchesDistance;
    });
  };

  const getFilteredCompetitionResults = () => {
    return competitionResults.filter((result) => {
      const matchesStyle =
        competitionFilter.style === "all" ||
        result.style === competitionFilter.style;
      const matchesDistance =
        competitionFilter.distance === "all" ||
        result.distance === competitionFilter.distance;
      return matchesStyle && matchesDistance;
    });
  };

  const getUniqueValues = (data, field) => {
    const values = [...new Set(data.map((item) => item[field]))].filter(
      Boolean
    );
    return values.sort();
  };

  const calculateBestTimes = (trainingTimes, competitionResults) => {
    const allTimes = [
      ...trainingTimes.map((t) => ({
        ...t,
        type: "Allenamento",
        timeInMilliseconds: timeToMilliseconds(t.timeFormatted),
      })),
      ...competitionResults.map((c) => ({
        ...c,
        type: "Gara",
        timeInMilliseconds: timeToMilliseconds(c.timeFormatted),
      })),
    ];

    const timesByStyleAndDistance = allTimes.reduce((acc, time) => {
      const key = `${time.style}-${time.distance}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(time);
      return acc;
    }, {});

    return Object.entries(timesByStyleAndDistance)
      .map(([key, times]) => {
        const sortedTimes = times.sort(
          (a, b) => a.timeInMilliseconds - b.timeInMilliseconds
        );
        const bestTime = sortedTimes[0];
        return {
          style: bestTime.style,
          distance: bestTime.distance,
          bestTime: bestTime.timeFormatted,
          date: bestTime.date,
          type: bestTime.type,
          timeInMilliseconds: bestTime.timeInMilliseconds,
        };
      })
      .sort((a, b) => {
        if (a.style === b.style)
          return parseInt(a.distance) - parseInt(b.distance);
        return a.style.localeCompare(b.style);
      });
  };

  const getPresenceForDay = (date) => {
    if (!date || !attendanceRecords || attendanceRecords.length === 0)
      return null;
    const targetDay = date.getDate();
    const targetMonth = date.getMonth();
    const targetYear = date.getFullYear();

    const matches = attendanceRecords.filter((record) => {
      const rDate = toDateObject(record.date);
      if (!rDate) return false;
      return (
        rDate.getDate() === targetDay &&
        rDate.getMonth() === targetMonth &&
        rDate.getFullYear() === targetYear
      );
    });

    if (matches.length === 0) return null;
    const gara = matches.find((m) => m.type === "gara");
    if (gara) return gara;
    return matches[0];
  };

  // Componente Calendario
  const CalendarView = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dayIndex = i - firstDayOfWeek + 1;
      if (dayIndex < 1 || dayIndex > daysInMonth) {
        cells.push(null);
      } else {
        cells.push(new Date(year, month, dayIndex));
      }
    }

    return (
      <div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode("list")}
            className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
              viewMode === "list"
                ? "bg-purple-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Lista
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
              viewMode === "calendar"
                ? "bg-purple-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Calendario
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              const newDate = new Date(currentMonth);
              newDate.setMonth(newDate.getMonth() - 1);
              setCurrentMonth(newDate);
            }}
            className="bg-orange-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors duration-200 shadow-md"
          >
            ← Mese precedente
          </button>
          <h3 className="text-lg font-semibold">
            {monthNames[month]} {year}
          </h3>
          <button
            onClick={() => {
              const newDate = new Date(currentMonth);
              newDate.setMonth(newDate.getMonth() + 1);
              setCurrentMonth(newDate);
            }}
            className="bg-orange-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors duration-200 shadow-md"
          >
            Mese successivo →
          </button>
        </div>

        <table className="calendar-table">
          <thead>
            <tr>
              {["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"].map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array(6)
              .fill(null)
              .map((_, weekIndex) => (
                <tr key={weekIndex}>
                  {cells
                    .slice(weekIndex * 7, weekIndex * 7 + 7)
                    .map((cellDate, idx) => {
                      if (!cellDate) {
                        return <td key={idx} className="calendar-cell-empty" />;
                      }

                      const presence = getPresenceForDay(cellDate);
                      let cellClass = "calendar-cell";

                      if (presence) {
                        switch (presence.present) {
                          case "Presente":
                            cellClass += " calendar-cell-present";
                            break;
                          case "Ritardo":
                          case "Uscita Anticipata":
                            cellClass += " calendar-cell-late";
                            break;
                          case "Assente":
                          case "Assente Giustificato":
                            cellClass += " calendar-cell-absent";
                            break;
                          default:
                            break;
                        }
                      }

                      return (
                        <td key={idx} className={cellClass}>
                          <div className="calendar-cell-day">
                            {cellDate.getDate()}
                          </div>
                          {presence && (
                            <div className="calendar-cell-presence">
                              <div className="presence-badge">
                                {getPresenceText(presence)}
                              </div>
                              {presence.type === "gara" &&
                                presence.eventName && (
                                  <div className="calendar-event-name">
                                    {presence.eventName}
                                  </div>
                                )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                </tr>
              ))}
          </tbody>
        </table>

        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h4 className="font-semibold mb-2">Legenda</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>P = Presente</div>
            <div>R = Ritardo</div>
            <div>A = Assente</div>
            <div>AG = Assente Giustificato</div>
            <div>UA = Uscita Anticipata</div>
          </div>
        </div>
      </div>
    );
  };

  // Modal per modificare tempo allenamento
  const TrainingEditModal = () => {
    if (!editingTraining) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-4">
            Modifica Tempo Allenamento
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Stile</label>
              <input
                type="text"
                value={editingTraining.style}
                onChange={(e) =>
                  setEditingTraining({
                    ...editingTraining,
                    style: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Distanza</label>
              <input
                type="text"
                value={editingTraining.distance}
                onChange={(e) =>
                  setEditingTraining({
                    ...editingTraining,
                    distance: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tempo (mm:ss.ms)
              </label>
              <input
                type="text"
                value={editingTraining.timeFormatted}
                onChange={(e) =>
                  setEditingTraining({
                    ...editingTraining,
                    timeFormatted: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
                placeholder="01:23.45"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Data</label>
              <input
                type="date"
                value={
                  editingTraining.date
                    ? editingTraining.date.toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  setEditingTraining({
                    ...editingTraining,
                    date: new Date(e.target.value),
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={handleSaveTraining}
              className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors duration-200 shadow-md"
            >
              ✅ Salva
            </button>
            <button
              onClick={() => setEditingTraining(null)}
              className="flex-1 bg-red-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-600 transition-colors duration-200 shadow-md"
            >
              ❌ Annulla
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Modal per modificare risultato gara
  const CompetitionEditModal = () => {
    if (!editingCompetition) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-4">
            Modifica Risultato Gara
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Nome Competizione
              </label>
              <input
                type="text"
                value={editingCompetition.competitionName || ""}
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    competitionName: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Stile</label>
              <input
                type="text"
                value={editingCompetition.style}
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    style: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Distanza</label>
              <input
                type="text"
                value={editingCompetition.distance}
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    distance: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tempo (mm:ss.ms)
              </label>
              <input
                type="text"
                value={editingCompetition.timeFormatted}
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    timeFormatted: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
                placeholder="01:23.45"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Piazzamento
              </label>
              <input
                type="number"
                value={editingCompetition.placement || ""}
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    placement: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Data</label>
              <input
                type="date"
                value={
                  editingCompetition.date
                    ? editingCompetition.date.toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  setEditingCompetition({
                    ...editingCompetition,
                    date: new Date(e.target.value),
                  })
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={handleSaveCompetition}
              className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors duration-200 shadow-md"
            >
              ✅ Salva
            </button>
            <button
              onClick={() => setEditingCompetition(null)}
              className="flex-1 bg-red-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-600 transition-colors duration-200 shadow-md"
            >
              ❌ Annulla
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div>Caricamento...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div>Atleta non trovato</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Scheda Atleta</h1>

      {/* Informazioni personali */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Informazioni Personali</h2>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="font-medium py-2">Nome</td>
              <td>{athlete.name}</td>
            </tr>
            <tr>
              <td className="font-medium py-2">Cognome</td>
              <td>{athlete.lastName}</td>
            </tr>
            <tr>
              <td className="font-medium py-2">Tipologia</td>
              <td>{athlete.type}</td>
            </tr>
            <tr>
              <td className="font-medium py-2">Anno di Nascita</td>
              <td>{athlete.birthYear}</td>
            </tr>
            <tr>
              <td className="font-medium py-2">Categoria</td>
              <td>{category}</td>
            </tr>
            <tr>
              <td className="font-medium py-2">Genere</td>
              <td>{athlete.gender}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Migliori Tempi */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Migliori Tempi Personali</h2>
        {trainingTimes.length > 0 || competitionResults.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Stile</th>
                <th className="text-left py-2">Distanza</th>
                <th className="text-left py-2">Miglior Tempo</th>
                <th className="text-left py-2">Data</th>
                <th className="text-left py-2">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {calculateBestTimes(trainingTimes, competitionResults).map(
                (record, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{record.style}</td>
                    <td>{record.distance}</td>
                    <td className="font-bold text-blue-600">
                      {formatTime(record.bestTime)}
                    </td>
                    <td>{formatDate(record.date)}</td>
                    <td>{record.type}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <p>Nessun tempo registrato.</p>
        )}
      </div>

      {/* Registro Presenze */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Registro Presenze</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 shadow-md ${
              viewMode === "calendar"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            📅 Calendario
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 shadow-md ${
              viewMode === "list"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            📋 Lista
          </button>
        </div>

        {viewMode === "calendar" ? (
          <CalendarView />
        ) : (
          <div>
            <div className="flex gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <select
                  value={attendanceFilter.type}
                  onChange={(e) =>
                    setAttendanceFilter((prev) => ({
                      ...prev,
                      type: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                >
                  <option value="all">Tutti</option>
                  <option value="allenamento">Allenamento</option>
                  <option value="gara">Gara</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Data Inizio</label>
                <input
                  type="date"
                  value={attendanceFilter.startDate}
                  onChange={(e) =>
                    setAttendanceFilter((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Data Fine</label>
                <input
                  type="date"
                  value={attendanceFilter.endDate}
                  onChange={(e) =>
                    setAttendanceFilter((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                />
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-left py-2">Stato</th>
                  <th className="text-left py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredAttendanceRecords().map((record) => (
                  <tr key={record.id} className="border-b">
                    <td className="py-2">{formatDate(record.date)}</td>
                    <td>
                      {record.type === "gara" ? (
                        <span>
                          {`Gara - ${
                            record.eventName || record.raceName || "-"
                          }`}
                        </span>
                      ) : (
                        "Allenamento"
                      )}
                    </td>
                    <td>{record.present}</td>
                    <td>{record.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tempi di Allenamento */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Tempi di Allenamento
          {(() => {
            const filtered = getFilteredTrainingTimes();
            return (
              filtered.length > 10 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({showAllTraining ? filtered.length : 10} di {filtered.length}
                  )
                </span>
              )
            );
          })()}
        </h2>

        {trainingTimes.length > 0 ? (
          <>
            <div className="flex gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">Stile</label>
                <select
                  value={trainingFilter.style}
                  onChange={(e) =>
                    setTrainingFilter((prev) => ({
                      ...prev,
                      style: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                >
                  <option value="all">Tutti gli stili</option>
                  {getUniqueValues(trainingTimes, "style").map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Distanza</label>
                <select
                  value={trainingFilter.distance}
                  onChange={(e) =>
                    setTrainingFilter((prev) => ({
                      ...prev,
                      distance: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                >
                  <option value="all">Tutte le distanze</option>
                  {getUniqueValues(trainingTimes, "distance").map(
                    (distance) => (
                      <option key={distance} value={distance}>
                        {distance}
                      </option>
                    )
                  )}
                </select>
              </div>

              {(trainingFilter.style !== "all" ||
                trainingFilter.distance !== "all") && (
                <button
                  onClick={() =>
                    setTrainingFilter({
                      style: "all",
                      distance: "all",
                    })
                  }
                  className="mt-6 px-4 py-2 bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 transition-colors duration-200 shadow-sm"
                >
                  🔄 Resetta filtri
                </button>
              )}
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Stile</th>
                  <th className="text-left py-2">Distanza</th>
                  <th className="text-left py-2">Tempo</th>
                  {(userRole === "admin" || userRole === "coach") && (
                    <th className="text-left py-2">Azioni</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(showAllTraining
                  ? getFilteredTrainingTimes()
                  : getFilteredTrainingTimes().slice(0, 10)
                ).map((session) => (
                  <tr key={session.id} className="border-b">
                    <td className="py-2">{formatDate(session.date)}</td>
                    <td>{session.style}</td>
                    <td>{session.distance}</td>
                    <td className="font-bold text-blue-600">
                      {formatTime(session.timeFormatted)}
                    </td>
                    {(userRole === "admin" || userRole === "coach") && (
                      <td>
                        <button
                          onClick={() => handleEditTraining(session)}
                          className="bg-yellow-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors duration-200 shadow-sm"
                        >
                          ✏️ Modifica
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {getFilteredTrainingTimes().length > 10 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowAllTraining(!showAllTraining)}
                  className="px-6 py-2.5 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors duration-200 shadow-md"
                >
                  {showAllTraining
                    ? "📤 Mostra meno"
                    : `📥 Mostra tutti (${getFilteredTrainingTimes().length})`}
                </button>
              </div>
            )}
          </>
        ) : (
          <p>Nessun tempo di allenamento registrato.</p>
        )}
      </div>

      {/* Risultati Gare */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Risultati delle Gare
          {(() => {
            const filtered = getFilteredCompetitionResults();
            return (
              filtered.length > 10 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({showAllCompetitions ? filtered.length : 10} di{" "}
                  {filtered.length})
                </span>
              )
            );
          })()}
        </h2>

        {competitionResults.length > 0 ? (
          <>
            <div className="flex gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">Stile</label>
                <select
                  value={competitionFilter.style}
                  onChange={(e) =>
                    setCompetitionFilter((prev) => ({
                      ...prev,
                      style: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                >
                  <option value="all">Tutti gli stili</option>
                  {getUniqueValues(competitionResults, "style").map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Distanza</label>
                <select
                  value={competitionFilter.distance}
                  onChange={(e) =>
                    setCompetitionFilter((prev) => ({
                      ...prev,
                      distance: e.target.value,
                    }))
                  }
                  className="border rounded px-3 py-2"
                >
                  <option value="all">Tutte le distanze</option>
                  {getUniqueValues(competitionResults, "distance").map(
                    (distance) => (
                      <option key={distance} value={distance}>
                        {distance}
                      </option>
                    )
                  )}
                </select>
              </div>

              {(competitionFilter.style !== "all" ||
                competitionFilter.distance !== "all") && (
                <button
                  onClick={() =>
                    setCompetitionFilter({
                      style: "all",
                      distance: "all",
                    })
                  }
                  className="mt-6 px-4 py-2 bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 transition-colors duration-200 shadow-sm"
                >
                  🔄 Resetta filtri
                </button>
              )}
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Competizione</th>
                  <th className="text-left py-2">Stile</th>
                  <th className="text-left py-2">Distanza</th>
                  <th className="text-left py-2">Tempo</th>
                  <th className="text-left py-2">Piazzamento</th>
                  {(userRole === "admin" || userRole === "coach") && (
                    <th className="text-left py-2">Azioni</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(showAllCompetitions
                  ? getFilteredCompetitionResults()
                  : getFilteredCompetitionResults().slice(0, 10)
                ).map((result) => (
                  <tr key={result.id} className="border-b">
                    <td className="py-2">{formatDate(result.date)}</td>
                    <td>{result.competitionName || "-"}</td>
                    <td>{result.style}</td>
                    <td>{result.distance}</td>
                    <td className="font-bold text-blue-600">
                      {formatTime(result.timeFormatted)}
                    </td>
                    <td>{result.placement ? `${result.placement}º` : "-"}</td>
                    {(userRole === "admin" || userRole === "coach") && (
                      <td>
                        <button
                          onClick={() => handleEditCompetition(result)}
                          className="bg-yellow-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors duration-200 shadow-sm"
                        >
                          ✏️ Modifica
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {getFilteredCompetitionResults().length > 10 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowAllCompetitions(!showAllCompetitions)}
                  className="px-6 py-2.5 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors duration-200 shadow-md"
                >
                  {showAllCompetitions
                    ? "📤 Mostra meno"
                    : `📥 Mostra tutti (${
                        getFilteredCompetitionResults().length
                      })`}
                </button>
              </div>
            )}
          </>
        ) : (
          <p>Nessun risultato di gara registrato.</p>
        )}
      </div>

      {/* Abbigliamento */}
      {(userRole === "admin" ||
        userRole === "coach" ||
        userRole === "user") && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Abbigliamento</h2>
          {Object.keys(clothingInfo).length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Articolo</th>
                  <th className="text-left py-2">Taglia</th>
                  <th className="text-left py-2">Quantità</th>
                  <th className="text-left py-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(clothingInfo).map(([item, info]) => {
                  if (
                    item !== "athleteId" &&
                    (info.size || info.quantity > 0)
                  ) {
                    return (
                      <tr key={item} className="border-b">
                        <td className="py-2">{item}</td>
                        <td>
                          {info.size === "Altro" && info.customSize
                            ? info.customSize
                            : info.size || "-"}
                        </td>
                        <td>{info.quantity || 0}</td>
                        <td>
                          {info.delivered ? "Consegnato" : "Non consegnato"}
                        </td>
                      </tr>
                    );
                  }
                  return null;
                })}
              </tbody>
            </table>
          ) : (
            <p>Abbigliamento non ordinato</p>
          )}
        </div>
      )}

      {/* Bottoni di azione */}
      <div className="flex gap-4">
        {(userRole === "admin" || userRole === "coach") && (
          <button
            onClick={() => navigate(`/clothing/${id}`)}
            className="inline-flex items-center px-6 py-3 border-0 text-sm font-medium rounded-lg shadow-md text-white bg-teal-600 hover:bg-teal-700 transition-colors duration-200"
          >
            👕 Gestisci Abbigliamento
          </button>
        )}
        <button
          onClick={() => navigate("/athletes")}
          className="inline-flex items-center px-6 py-3 border-0 text-sm font-medium rounded-lg shadow-md text-white bg-slate-600 hover:bg-slate-700 transition-colors duration-200"
        >
          📋 Lista Atleti
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center px-6 py-3 border-0 text-sm font-medium rounded-lg shadow-md text-white bg-emerald-600 hover:bg-emerald-700 transition-colors duration-200"
        >
          🏠 Vai alla Dashboard
        </button>
      </div>

      {/* Modal Modifica Allenamento */}
      <TrainingEditModal />

      {/* Modal Modifica Gara */}
      <CompetitionEditModal />
    </div>
  );
}
