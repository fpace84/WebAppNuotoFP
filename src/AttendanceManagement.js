import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteDoc } from "firebase/firestore";
import { calculateCategory } from "./categories";
import "./attendanceManagement.css";

export default function AttendanceManagement() {
  // Funzione per ottenere la data di oggi nel formato corretto
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [athletes, setAthletes] = useState([]);
  const [filteredAthletes, setFilteredAthletes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attendances, setAttendances] = useState({});
  const [existingAttendances, setExistingAttendances] = useState({});
  const [editMode, setEditMode] = useState({});
  const [presenceFilter, setPresenceFilter] = useState("all");
  const [selectedAthletes, setSelectedAthletes] = useState(new Set());

  const presenceOptions = [
    "Presente",
    "Assente",
    "Assente Giustificato",
    "Ritardo",
    "Uscita Anticipata",
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const athletesSnapshot = await getDocs(collection(db, "athletes"));
        const athletesList = athletesSnapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((athlete) => !athlete.archived)
          .sort((a, b) => {
            const lastNameCompare = a.lastName.localeCompare(b.lastName);
            return lastNameCompare !== 0
              ? lastNameCompare
              : a.name.localeCompare(b.name);
          });
        setAthletes(athletesList);
        setFilteredAthletes(athletesList);

        if (eventType === "gara") {
          const racesSnapshot = await getDocs(collection(db, "races"));
          const racesList = racesSnapshot.docs
            .filter(
              (doc) => !doc.data().status || doc.data().status === "upcoming"
            )
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
          setRaces(racesList);
        }

        await checkExistingAttendances(athletesList, date);
      } catch (error) {
        console.error("Errore nel caricamento dei dati:", error);
        setError("Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [eventType, date]);

  useEffect(() => {
    const filteredList = athletes.filter((athlete) => {
      if (selectedType && athlete.type !== selectedType) {
        return false;
      }

      if (selectedCategories.length > 0) {
        const athleteCategory = calculateCategory(
          athlete.birthYear,
          athlete.type,
          athlete.gender
        );
        if (!selectedCategories.includes(athleteCategory)) {
          return false;
        }
      }

      if (searchTerm) {
        const fullName = `${athlete.lastName} ${athlete.name}`.toLowerCase();
        if (!fullName.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    setFilteredAthletes(filteredList);
  }, [athletes, selectedType, selectedCategories, searchTerm]);

  const checkExistingAttendances = async (athletesList, selectedDate) => {
    try {
      const dateStart = new Date(selectedDate);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(selectedDate);
      dateEnd.setHours(23, 59, 59, 999);

      const attendanceRef = collection(db, "attendance");
      const attendanceSnapshot = await getDocs(
        query(
          attendanceRef,
          where("date", ">=", dateStart),
          where("date", "<=", dateEnd)
        )
      );

      const existingRecords = {};
      const editModeState = {};
      const attendanceStates = {};

      attendanceSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        existingRecords[data.athleteId] = { id: doc.id, ...data };
        editModeState[data.athleteId] = false;
        attendanceStates[data.athleteId] = {
          present: data.present,
          notes: data.notes || "",
        };
      });

      setExistingAttendances(existingRecords);
      setEditMode(editModeState);
      setAttendances(attendanceStates);
    } catch (error) {
      console.error("Errore nel controllo delle presenze:", error);
    }
  };

  const handleAttendanceChange = (athleteId, field, value) => {
    if (!editMode[athleteId] && existingAttendances[athleteId]) {
      return;
    }

    setAttendances((prev) => ({
      ...prev,
      [athleteId]: {
        ...prev[athleteId],
        [field]: value,
      },
    }));
  };

  const handleEnableEdit = (athleteId) => {
    setEditMode((prev) => ({
      ...prev,
      [athleteId]: true,
    }));
  };

  const handleDelete = async (athleteId) => {
    if (window.confirm("Sei sicuro di voler eliminare questa presenza?")) {
      try {
        await deleteDoc(
          doc(db, "attendance", existingAttendances[athleteId].id)
        );

        setExistingAttendances((prev) => {
          const newState = { ...prev };
          delete newState[athleteId];
          return newState;
        });

        setAttendances((prev) => {
          const newState = { ...prev };
          delete newState[athleteId];
          return newState;
        });

        setEditMode((prev) => {
          const newState = { ...prev };
          delete newState[athleteId];
          return newState;
        });

        alert("Presenza eliminata con successo");
      } catch (error) {
        console.error("Errore durante l'eliminazione:", error);
        alert("Errore durante l'eliminazione della presenza");
      }
    }
  };

  const handleSaveRow = async (athleteId) => {
    try {
      const attendance = attendances[athleteId];
      if (!attendance?.present) {
        alert("Seleziona uno stato di presenza");
        return;
      }

      const athlete = athletes.find((a) => a.id === athleteId);
      if (!athlete) return;

      let eventDate = new Date(date);
      if (eventType === "gara" && selectedRace) {
        const selectedRaceData = races.find(
          (race) => race.name === selectedRace
        );
        if (selectedRaceData) {
          eventDate = new Date(selectedRaceData.date);
        }
      }

      if (existingAttendances[athleteId]) {
        await updateDoc(
          doc(db, "attendance", existingAttendances[athleteId].id),
          {
            present: attendance.present,
            notes: attendance.notes || "",
            date: eventDate,
          }
        );

        setExistingAttendances((prev) => ({
          ...prev,
          [athleteId]: {
            ...prev[athleteId],
            present: attendance.present,
            notes: attendance.notes || "",
            date: eventDate,
          },
        }));

        setAttendances((prev) => ({
          ...prev,
          [athleteId]: {
            present: attendance.present,
            notes: attendance.notes || "",
          },
        }));
      } else {
        const newAttendanceRef = await addDoc(collection(db, "attendance"), {
          athleteId,
          athleteName: `${athlete.name} ${athlete.lastName}`,
          category: calculateCategory(
            athlete.birthYear,
            athlete.type,
            athlete.gender
          ),
          type: eventType,
          date: eventDate,
          present: attendance.present,
          notes: attendance.notes || "",
          createdAt: new Date(),
          eventName: eventType === "gara" ? selectedRace : null,
        });

        const newAttendance = {
          id: newAttendanceRef.id,
          athleteId,
          present: attendance.present,
          notes: attendance.notes || "",
          type: eventType,
          date: eventDate,
        };

        setExistingAttendances((prev) => ({
          ...prev,
          [athleteId]: newAttendance,
        }));

        setAttendances((prev) => ({
          ...prev,
          [athleteId]: {
            present: attendance.present,
            notes: attendance.notes || "",
          },
        }));
      }

      setEditMode((prev) => ({
        ...prev,
        [athleteId]: false,
      }));

      alert("Presenza salvata con successo!");
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio della presenza");
    }
  };

  const handleSaveAll = async () => {
    try {
      let savedCount = 0;
      let updatedAttendances = { ...existingAttendances };
      let updatedAttendanceStates = { ...attendances };
      let newEditModes = { ...editMode };

      let eventDate = new Date(date);
      if (eventType === "gara" && selectedRace) {
        const selectedRaceData = races.find(
          (race) => race.name === selectedRace
        );
        if (selectedRaceData) {
          eventDate = new Date(selectedRaceData.date);
        }
      }

      for (const athlete of filteredAthletes) {
        const attendance = attendances[athlete.id];
        if (attendance?.present) {
          if (existingAttendances[athlete.id] && editMode[athlete.id]) {
            await updateDoc(
              doc(db, "attendance", existingAttendances[athlete.id].id),
              {
                present: attendance.present,
                notes: attendance.notes || "",
                date: eventDate,
              }
            );

            updatedAttendances[athlete.id] = {
              ...existingAttendances[athlete.id],
              present: attendance.present,
              notes: attendance.notes || "",
              date: eventDate,
            };

            updatedAttendanceStates[athlete.id] = {
              present: attendance.present,
              notes: attendance.notes || "",
            };

            newEditModes[athlete.id] = false;
            savedCount++;
          } else if (!existingAttendances[athlete.id]) {
            const newAttendanceRef = await addDoc(
              collection(db, "attendance"),
              {
                athleteId: athlete.id,
                athleteName: `${athlete.name} ${athlete.lastName}`,
                category: calculateCategory(
                  athlete.birthYear,
                  athlete.type,
                  athlete.gender
                ),
                type: eventType,
                date: eventDate,
                present: attendance.present,
                notes: attendance.notes || "",
                createdAt: new Date(),
                eventName: eventType === "gara" ? selectedRace : null,
              }
            );

            updatedAttendances[athlete.id] = {
              id: newAttendanceRef.id,
              athleteId: athlete.id,
              present: attendance.present,
              notes: attendance.notes || "",
              type: eventType,
              date: eventDate,
            };

            updatedAttendanceStates[athlete.id] = {
              present: attendance.present,
              notes: attendance.notes || "",
            };

            newEditModes[athlete.id] = false;
            savedCount++;
          }
        }
      }

      if (savedCount > 0) {
        setExistingAttendances(updatedAttendances);
        setAttendances(updatedAttendanceStates);
        setEditMode(newEditModes);
        alert(`Salvate con successo ${savedCount} presenze!`);
      } else {
        alert("Nessuna presenza da salvare");
      }
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio delle presenze");
    }
  };

  // Nuove funzioni per la selezione
  const handleSelectAthlete = (athleteId) => {
    setSelectedAthletes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(athleteId)) {
        newSet.delete(athleteId);
      } else {
        newSet.add(athleteId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedAthletes.size === filteredAthletes.length) {
      setSelectedAthletes(new Set());
    } else {
      setSelectedAthletes(new Set(filteredAthletes.map((a) => a.id)));
    }
  };

  const applyStatusToSelected = (status) => {
    if (selectedAthletes.size === 0) {
      alert("Seleziona almeno un atleta");
      return;
    }

    const newAttendances = { ...attendances };
    selectedAthletes.forEach((athleteId) => {
      if (!existingAttendances[athleteId] || editMode[athleteId]) {
        newAttendances[athleteId] = {
          ...newAttendances[athleteId],
          present: status,
        };
      }
    });
    setAttendances(newAttendances);
    setSelectedAthletes(new Set()); // Deseleziona tutti dopo l'applicazione
  };

  if (loading) return <div className="text-center py-4">Caricamento...</div>;
  if (error)
    return <div className="text-center py-4 text-red-600">{error}</div>;

  return (
    <div className="container pb-56 sm:pb-48">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Gestione Presenze</h2>
        </div>
        <div className="card-body">
          {/* Tipo Evento e Data */}
          <div className="grid grid-cols-1">
            <div>
              <label className="form-label">Tipo Evento</label>
              <select
                className="form-select"
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setSelectedRace("");
                  // Imposta la data di oggi quando si seleziona "allenamento"
                  if (e.target.value === "allenamento") {
                    setDate(getTodayDate());
                  }
                }}
              >
                <option value="">Seleziona Evento</option>
                <option value="allenamento">Allenamento</option>
                <option value="gara">Gara</option>
              </select>
            </div>

            {eventType === "allenamento" ? (
              <div>
                <label className="form-label">Data</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div>
                <label className="form-label">Seleziona Gara</label>
                <select
                  className="form-select"
                  value={selectedRace}
                  onChange={(e) => setSelectedRace(e.target.value)}
                  required
                >
                  <option value="">Seleziona una gara</option>
                  {races.map((race) => (
                    <option key={race.id} value={race.name}>
                      {race.name} - {new Date(race.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Filtri Atleti */}
          <div className="grid grid-cols-1">
            <div>
              <label className="form-label">Tipologia</label>
              <select
                className="form-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="">Tutte le tipologie</option>
                <option value="Agonista">Agonista</option>
                <option value="Propaganda">Propaganda</option>
              </select>
            </div>
            <div>
              <label className="form-label">Categorie</label>
              <select
                className="form-select"
                multiple
                value={selectedCategories}
                onChange={(e) => {
                  const values = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  setSelectedCategories(values);
                }}
              >
                {[
                  ...new Set(
                    athletes
                      .filter((a) => !selectedType || a.type === selectedType)
                      .map((a) =>
                        calculateCategory(a.birthYear, a.type, a.gender)
                      )
                  ),
                ]
                  .sort()
                  .map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="form-label">Cerca per Cognome Nome</label>
              <input
                type="text"
                className="form-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cerca..."
              />
            </div>

            <div>
              <label className="form-label">Filtra per Stato</label>
              <select
                className="form-select"
                value={presenceFilter}
                onChange={(e) => setPresenceFilter(e.target.value)}
              >
                <option value="all">Tutti gli stati</option>
                {presenceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabella Presenze */}
      <div className="card">
        <div className="card-body">
          <div className="table-container">
            <table className="table">
              <thead className="table-header">
                <tr>
                  <th style={{ width: "50px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredAthletes.length > 0 &&
                        selectedAthletes.size === filteredAthletes.length
                      }
                      onChange={handleSelectAll}
                      style={{
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        accentColor: "#3b82f6",
                        transform: "scale(1.5)",
                      }}
                    />
                  </th>
                  <th>Atleta</th>
                  <th>Stato</th>
                  <th>Note</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredAthletes.map((athlete) => (
                  <tr key={athlete.id} className="table-row">
                    <td className="table-cell" style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedAthletes.has(athlete.id)}
                        onChange={() => handleSelectAthlete(athlete.id)}
                        style={{
                          width: "20px",
                          height: "20px",
                          cursor: "pointer",
                          accentColor: "#3b82f6",
                          transform: "scale(1.5)",
                        }}
                      />
                    </td>
                    <td className="table-cell">
                      {athlete.lastName} {athlete.name}
                    </td>
                    <td className="table-cell">
                      <select
                        value={attendances[athlete.id]?.present || ""}
                        onChange={(e) =>
                          handleAttendanceChange(
                            athlete.id,
                            "present",
                            e.target.value
                          )
                        }
                        className="form-select"
                        disabled={
                          existingAttendances[athlete.id] &&
                          !editMode[athlete.id]
                        }
                      >
                        <option value="">Seleziona</option>
                        {presenceOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell">
                      <input
                        type="text"
                        value={attendances[athlete.id]?.notes || ""}
                        onChange={(e) =>
                          handleAttendanceChange(
                            athlete.id,
                            "notes",
                            e.target.value
                          )
                        }
                        className="form-input"
                        placeholder="Note"
                        disabled={
                          existingAttendances[athlete.id] &&
                          !editMode[athlete.id]
                        }
                      />
                    </td>
                    <td className="table-cell">
                      {existingAttendances[athlete.id] ? (
                        editMode[athlete.id] ? (
                          <>
                            <button
                              onClick={() => handleSaveRow(athlete.id)}
                              className="btn btn-success"
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => handleDelete(athlete.id)}
                              className="btn btn-danger"
                            >
                              Elimina
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleEnableEdit(athlete.id)}
                            className="btn btn-primary"
                          >
                            Modifica
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleSaveRow(athlete.id)}
                          className="btn btn-success"
                        >
                          Salva
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pannello azioni rapide, fisso in basso mentre si scorre la lista atleti */}
      {filteredAthletes.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 sm:bottom-4 sm:left-4 sm:right-4 bg-white shadow-lg border-t sm:border sm:rounded-lg z-50">
          <div className="p-2 sm:p-3 bg-gray-50 sm:rounded-lg">
            <div className="mb-2 sm:mb-3">
              <p className="font-semibold text-gray-700 text-sm sm:text-base">
                {selectedAthletes.size > 0
                  ? `${selectedAthletes.size} atleti selezionati`
                  : "Seleziona gli atleti e applica uno stato:"}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 flex-wrap">
              <button
                onClick={() => applyStatusToSelected("Presente")}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 sm:py-2 px-3 sm:px-4 rounded text-sm sm:text-base"
                disabled={selectedAthletes.size === 0}
              >
                ✓ Presente
              </button>
              <button
                onClick={() => applyStatusToSelected("Assente")}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 sm:py-2 px-3 sm:px-4 rounded text-sm sm:text-base"
                disabled={selectedAthletes.size === 0}
              >
                ✗ Assente
              </button>
              <button
                onClick={() => applyStatusToSelected("Assente Giustificato")}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 sm:py-2 px-3 sm:px-4 rounded text-sm sm:text-base"
                disabled={selectedAthletes.size === 0}
              >
                ⓘ Ass. Giust.
              </button>
              <button
                onClick={() => applyStatusToSelected("Ritardo")}
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 sm:py-2 px-3 sm:px-4 rounded text-sm sm:text-base"
                disabled={selectedAthletes.size === 0}
              >
                ⏰ Ritardo
              </button>
              <button
                onClick={() => applyStatusToSelected("Uscita Anticipata")}
                className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 sm:py-2 px-3 sm:px-4 rounded text-sm sm:text-base col-span-2 sm:col-span-1"
                disabled={selectedAthletes.size === 0}
              >
                ⏪ Uscita Anticipata
              </button>
            </div>
          </div>

          <div className="p-2 sm:p-3 pt-0 sm:pt-0 flex justify-center sm:justify-end">
            <button
              onClick={handleSaveAll}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 sm:px-8 rounded text-sm sm:text-base w-full sm:w-auto"
            >
              Salva tutte le presenze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
