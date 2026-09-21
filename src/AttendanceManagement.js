import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
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
  const cardRefs = useRef({});
  const [presenceFilter, setPresenceFilter] = useState("all");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  // Chiude il menu a tendina categorie quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleEnableEdit = (athleteId) => {
    setEditMode((prev) => ({
      ...prev,
      [athleteId]: true,
    }));
  };

  // Imposta lo stato di un atleta con un tasto rapido e scorre
  // automaticamente alla scheda dell'atleta successivo.
  const setStatusAndAdvance = (athleteId, status) => {
    setAttendances((prev) => ({
      ...prev,
      [athleteId]: {
        ...prev[athleteId],
        present: status,
      },
    }));
    setEditMode((prev) => ({
      ...prev,
      [athleteId]: false,
    }));

    const currentIndex = filteredAthletes.findIndex(
      (a) => a.id === athleteId
    );
    const nextAthlete = filteredAthletes[currentIndex + 1];
    if (nextAthlete && cardRefs.current[nextAthlete.id]) {
      cardRefs.current[nextAthlete.id].scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
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

  if (loading) return <div className="text-center py-4">Caricamento...</div>;
  if (error)
    return <div className="text-center py-4 text-red-600">{error}</div>;

  // Il pannello azioni rapide compare solo dopo aver compilato tutti i menu
  // a tendina: tipo evento, data (o gara), tipologia e almeno una categoria.
  const allFiltersCompleted =
    eventType &&
    (eventType === "allenamento" ? !!date : !!selectedRace) &&
    !!selectedType &&
    selectedCategories.length > 0;

  // Vero solo quando ogni atleta dell'elenco ha già uno stato impostato:
  // solo a quel punto compare il pulsante per salvare tutto.
  const allStatusesSet =
    filteredAthletes.length > 0 &&
    filteredAthletes.every((athlete) => attendances[athlete.id]?.present);

  return (
    <div className="container">
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
            <div className="category-dropdown" ref={categoryDropdownRef}>
              <label className="form-label">Categorie</label>
              {(() => {
                const availableCategories = [
                  ...new Set(
                    athletes
                      .filter((a) => !selectedType || a.type === selectedType)
                      .map((a) =>
                        calculateCategory(a.birthYear, a.type, a.gender)
                      )
                  ),
                ].sort();

                const allSelected =
                  availableCategories.length > 0 &&
                  selectedCategories.length === availableCategories.length;

                const toggleCategory = (category) => {
                  setSelectedCategories((prev) =>
                    prev.includes(category)
                      ? prev.filter((c) => c !== category)
                      : [...prev, category]
                  );
                };

                const toggleSelectAllCategories = () => {
                  setSelectedCategories(
                    allSelected ? [] : [...availableCategories]
                  );
                };

                return (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setIsCategoryDropdownOpen((prev) => !prev)
                      }
                      className={`category-dropdown-toggle ${
                        isCategoryDropdownOpen ? "open" : ""
                      }`}
                    >
                      <span>
                        {selectedCategories.length > 0
                          ? `${selectedCategories.length} categorie selezionate`
                          : "Nessuna categoria selezionata"}
                      </span>
                      <span className="category-dropdown-caret">▾</span>
                    </button>

                    {isCategoryDropdownOpen && (
                      <div className="category-dropdown-panel">
                        <label className="category-dropdown-item select-all">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAllCategories}
                            disabled={availableCategories.length === 0}
                          />
                          <span>Seleziona tutte</span>
                        </label>
                        <div className="category-dropdown-list">
                          {availableCategories.length === 0 ? (
                            <div className="category-dropdown-empty">
                              Nessuna categoria disponibile
                            </div>
                          ) : (
                            availableCategories.map((category) => (
                              <label
                                key={category}
                                className={`category-dropdown-item ${
                                  selectedCategories.includes(category)
                                    ? "selected"
                                    : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCategories.includes(
                                    category
                                  )}
                                  onChange={() => toggleCategory(category)}
                                />
                                <span>{category}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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

      {/* Elenco Presenze - schede a scorrimento a scatto, un atleta alla volta */}
      <div
        style={{
          maxHeight: "calc(100vh - 260px)",
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          borderRadius: "12px",
          marginBottom: "16px",
        }}
      >
        {filteredAthletes.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-4">
              Nessun atleta trovato con i filtri selezionati
            </div>
          </div>
        ) : (
          filteredAthletes.map((athlete) => {
            const isLocked =
              attendances[athlete.id]?.present && !editMode[athlete.id];

            return (
            <div
              key={athlete.id}
              ref={(el) => (cardRefs.current[athlete.id] = el)}
              style={{
                minHeight: "min(55vh, 380px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                boxSizing: "border-box",
                padding: "16px",
                backgroundColor: "#f8f9fa",
                borderRadius: "12px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  fontWeight: "600",
                  fontSize: "18px",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                {athlete.lastName} {athlete.name}
              </div>

              {isLocked ? (
                <>
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: "15px",
                      marginBottom: "16px",
                    }}
                  >
                    Stato:{" "}
                    <strong>{attendances[athlete.id].present}</strong>
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      justifyContent: "center",
                    }}
                  >
                    <button
                      onClick={() => handleEnableEdit(athlete.id)}
                      className="btn btn-primary"
                    >
                      Modifica
                    </button>
                    {existingAttendances[athlete.id] && (
                      <button
                        onClick={() => handleDelete(athlete.id)}
                        className="btn btn-danger"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <button
                    onClick={() => setStatusAndAdvance(athlete.id, "Presente")}
                    className="quick-action-btn presente"
                  >
                    ✓ Presente
                  </button>
                  <button
                    onClick={() => setStatusAndAdvance(athlete.id, "Assente")}
                    className="quick-action-btn assente"
                  >
                    ✗ Assente
                  </button>
                  <button
                    onClick={() =>
                      setStatusAndAdvance(athlete.id, "Assente Giustificato")
                    }
                    className="quick-action-btn giustificato"
                  >
                    ⓘ Ass. Giust.
                  </button>
                  <button
                    onClick={() => setStatusAndAdvance(athlete.id, "Ritardo")}
                    className="quick-action-btn ritardo"
                  >
                    ⏰ Ritardo
                  </button>
                  <button
                    onClick={() =>
                      setStatusAndAdvance(athlete.id, "Uscita Anticipata")
                    }
                    className="quick-action-btn uscita"
                    style={{ gridColumn: "span 2" }}
                  >
                    ⏪ Uscita Anticipata
                  </button>
                </div>
              )}
            </div>
            );
          })
        )}
      </div>

      {/* Pannello azioni rapide, fisso in basso mentre si scorre la lista atleti */}
      {allFiltersCompleted && filteredAthletes.length > 0 && allStatusesSet && (
        <div className="quick-actions-panel">
          <div className="quick-actions-save-wrap">
            <button onClick={handleSaveAll} className="quick-actions-save-btn">
              Salva tutte le presenze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
