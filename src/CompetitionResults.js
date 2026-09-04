import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { calculateCategory } from "./categories";
import "./competitionResults.css";

export default function CompetitionResults() {
  const [athletes, setAthletes] = useState([]);
  const [filteredAthletes, setFilteredAthletes] = useState([]);
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [races, setRaces] = useState([]);
  const [existingResults, setExistingResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const styles = ["Stile libero", "Dorso", "Rana", "Farfalla", "Misto"];
  const distances = ["25m", "50m", "100m", "200m", "400m", "800m", "1500m"];

  // Carica atleti e gare esistenti
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [athletesSnapshot, racesSnapshot, competitionsSnapshot] =
          await Promise.all([
            getDocs(collection(db, "athletes")),
            getDocs(collection(db, "races")),
            getDocs(collection(db, "competitions")),
          ]);

        // Carica e ordina atleti
        const athletesList = athletesSnapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            entries: [
              {
                competitionName: "",
                date: "",
                style: "",
                distance: "",
                minutes: "",
                seconds: "",
                decimal: "",
                placement: "",
              },
            ],
          }))
          // Filtra per mostrare solo atleti non archiviati
          .filter((athlete) => !athlete.archived)
          .sort((a, b) => {
            const lastNameCompare = a.lastName.localeCompare(b.lastName);
            return lastNameCompare !== 0
              ? lastNameCompare
              : a.name.localeCompare(b.name);
          });

        // Carica gare
        const racesList = racesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Struttura per tenere traccia dei risultati esistenti
        const resultsMap = {};
        competitionsSnapshot.docs.forEach((doc) => {
          const result = doc.data();
          const key = `${result.athleteId}-${result.competitionName}-${result.style}-${result.distance}`;
          if (!resultsMap[key]) {
            resultsMap[key] = [];
          }
          resultsMap[key].push(result);
        });

        setAthletes(athletesList);
        setFilteredAthletes(athletesList);
        setRaces(racesList);
        setExistingResults(resultsMap);
      } catch (error) {
        console.error("Errore nel caricamento dei dati:", error);
        setError("Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtra atleti quando cambia la tipologia o la categoria
  useEffect(() => {
    let filtered = [...athletes];
    if (selectedType) {
      filtered = filtered.filter((athlete) => athlete.type === selectedType);
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((athlete) => {
        const category = calculateCategory(
          athlete.birthYear,
          athlete.type,
          athlete.gender
        );
        return selectedCategories.includes(category);
      });
    }
    setFilteredAthletes(filtered);
  }, [athletes, selectedType, selectedCategories]);

  // Controlla se esiste già un risultato per questa combinazione
  const hasExistingResult = (athleteId, competitionName, style, distance) => {
    const key = `${athleteId}-${competitionName}-${style}-${distance}`;
    return existingResults[key]?.length > 0;
  };

  const handleAthleteSelect = (athleteId) => {
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!selectedAthletes.find((a) => a.id === athleteId)) {
      setSelectedAthletes([
        ...selectedAthletes,
        {
          ...athlete,
          entries: [
            {
              competitionName: "",
              date: "",
              style: "",
              distance: "",
              minutes: "",
              seconds: "",
              decimal: "",
              placement: "",
            },
          ],
        },
      ]);
    }
  };

  const removeAthlete = (athleteId) => {
    setSelectedAthletes(selectedAthletes.filter((a) => a.id !== athleteId));
  };

  const addRow = (athleteId) => {
    setSelectedAthletes(
      selectedAthletes.map((athlete) => {
        if (athlete.id === athleteId) {
          return {
            ...athlete,
            entries: [
              ...athlete.entries,
              {
                competitionName: "",
                date: "",
                style: "",
                distance: "",
                minutes: "",
                seconds: "",
                decimal: "",
                placement: "",
              },
            ],
          };
        }
        return athlete;
      })
    );
  };

  const removeRow = (athleteId, index) => {
    setSelectedAthletes(
      selectedAthletes.map((athlete) => {
        if (athlete.id === athleteId) {
          return {
            ...athlete,
            entries: athlete.entries.filter((_, i) => i !== index),
          };
        }
        return athlete;
      })
    );
  };

  const updateEntry = (athleteId, index, field, value) => {
    setSelectedAthletes(
      selectedAthletes.map((athlete) => {
        if (athlete.id === athleteId) {
          const newEntries = [...athlete.entries];
          newEntries[index] = { ...newEntries[index], [field]: value };

          // Se viene selezionata una gara esistente, imposta anche la data
          if (field === "competitionName" && value !== "altro") {
            const selectedRace = races.find((race) => race.name === value);
            if (selectedRace) {
              newEntries[index].date = selectedRace.date;
            }
          }

          return { ...athlete, entries: newEntries };
        }
        return athlete;
      })
    );
  };

  const formatTime = (minutes, seconds, decimal) => {
    return `${minutes.padStart(2, "0")}'${seconds.padStart(
      2,
      "0"
    )}"${decimal.padStart(2, "0")}`;
  };

  const handleSaveRow = async (athleteId, index) => {
    try {
      const athlete = selectedAthletes.find((a) => a.id === athleteId);
      const entry = athlete.entries[index];

      if (
        !entry.competitionName ||
        !entry.date ||
        !entry.style ||
        !entry.distance
      ) {
        alert("Compila tutti i campi obbligatori");
        return;
      }

      // Verifica se esiste già un risultato per questa combinazione
      if (
        hasExistingResult(
          athleteId,
          entry.competitionName,
          entry.style,
          entry.distance
        )
      ) {
        alert(
          "Esiste già un risultato per questa combinazione di gara, stile e distanza per questo atleta"
        );
        return;
      }

      const timeFormatted = formatTime(
        entry.minutes || "00",
        entry.seconds || "00",
        entry.decimal || "00"
      );

      // ⭐ CALCOLA E SALVA CATEGORIA E TIPO STATICI AL MOMENTO DELLA GARA
      const currentCategory = calculateCategory(
        athlete.birthYear,
        athlete.type,
        athlete.gender
      );

      const newResult = {
        athleteId,
        athleteName: `${athlete.name} ${athlete.lastName}`,
        competitionName: entry.competitionName,
        date: entry.date,
        style: entry.style,
        distance: entry.distance,
        timeFormatted,
        placement: entry.placement,
        // ⭐ CAMPI STATICI - NON CAMBIANO MAI DOPO IL SALVATAGGIO
        category: currentCategory, // Categoria al momento della gara
        recordType: athlete.type, // Tipologia al momento della gara
        createdAt: new Date(),
      };

      await addDoc(collection(db, "competitions"), newResult);

      // Aggiorna existingResults
      const key = `${athleteId}-${entry.competitionName}-${entry.style}-${entry.distance}`;
      setExistingResults((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), newResult],
      }));

      alert("Risultato salvato con successo!");

      // Pulisci solo la riga salvata
      setSelectedAthletes(
        selectedAthletes.map((a) => {
          if (a.id === athleteId) {
            const newEntries = [...a.entries];
            newEntries[index] = {
              competitionName: "",
              date: "",
              style: "",
              distance: "",
              minutes: "",
              seconds: "",
              decimal: "",
              placement: "",
            };
            return { ...a, entries: newEntries };
          }
          return a;
        })
      );
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio del risultato");
    }
  };

  const handleSaveAll = async () => {
    try {
      let savedCount = 0;
      for (const athlete of selectedAthletes) {
        // ⭐ CALCOLA CATEGORIA UNA VOLTA PER ATLETA
        const currentCategory = calculateCategory(
          athlete.birthYear,
          athlete.type,
          athlete.gender
        );

        for (const entry of athlete.entries) {
          if (
            entry.competitionName &&
            entry.date &&
            entry.style &&
            entry.distance
          ) {
            // Verifica duplicati
            if (
              hasExistingResult(
                athlete.id,
                entry.competitionName,
                entry.style,
                entry.distance
              )
            ) {
              alert(
                `Saltato un risultato per ${athlete.name} ${athlete.lastName}: combinazione già esistente`
              );
              continue;
            }

            const timeFormatted = formatTime(
              entry.minutes || "00",
              entry.seconds || "00",
              entry.decimal || "00"
            );

            const newResult = {
              athleteId: athlete.id,
              athleteName: `${athlete.name} ${athlete.lastName}`,
              competitionName: entry.competitionName,
              date: entry.date,
              style: entry.style,
              distance: entry.distance,
              timeFormatted,
              placement: entry.placement,
              // ⭐ CAMPI STATICI - NON CAMBIANO MAI DOPO IL SALVATAGGIO
              category: currentCategory, // Categoria al momento della gara
              recordType: athlete.type, // Tipologia al momento della gara
              createdAt: new Date(),
            };

            await addDoc(collection(db, "competitions"), newResult);

            // Aggiorna existingResults
            const key = `${athlete.id}-${entry.competitionName}-${entry.style}-${entry.distance}`;
            setExistingResults((prev) => ({
              ...prev,
              [key]: [...(prev[key] || []), newResult],
            }));

            savedCount++;
          }
        }
      }

      if (savedCount > 0) {
        alert(`Salvati con successo ${savedCount} risultati!`);
        setSelectedAthletes(
          selectedAthletes.map((athlete) => ({
            ...athlete,
            entries: [
              {
                competitionName: "",
                date: "",
                style: "",
                distance: "",
                minutes: "",
                seconds: "",
                decimal: "",
                placement: "",
              },
            ],
          }))
        );
      } else {
        alert("Nessun risultato valido da salvare");
      }
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio dei risultati");
    }
  };

  // Ottieni le categorie disponibili
  const availableCategories = [
    ...new Set(
      athletes
        .filter((a) => !selectedType || a.type === selectedType)
        .map((a) => calculateCategory(a.birthYear, a.type, a.gender))
    ),
  ].sort();

  if (loading) return <div className="text-center py-4">Caricamento...</div>;
  if (error)
    return <div className="text-center py-4 text-red-600">{error}</div>;

  return (
    <div className="container mx-auto p-4 mb-20">
      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">Inserimento Risultati Gare</h2>
        </div>
        <div className="card-body">
          {/* Filtri */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Tipologia</label>
              <select
                className="form-select"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setSelectedCategories([]);
                }}
              >
                <option value="">Tutte le tipologie</option>
                <option value="Agonista">Agonista</option>
                <option value="Propaganda">Propaganda</option>
                <option value="Master">Master</option>
              </select>
            </div>

            <div>
              <label className="form-label">Categoria</label>
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
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selezione Atleta */}
          <div className="mb-4">
            <label className="form-label">Aggiungi Atleta</label>
            <select
              className="form-select"
              onChange={(e) => handleAthleteSelect(e.target.value)}
              value=""
            >
              <option value="">Seleziona atleta</option>
              {filteredAthletes
                .filter((a) => !selectedAthletes.find((sa) => sa.id === a.id))
                .map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.lastName} {athlete.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sezioni per ogni atleta */}
      {selectedAthletes.map((athlete) => (
        <div key={athlete.id} className="card mb-4">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">
              {athlete.lastName} {athlete.name} -{" "}
              {calculateCategory(
                athlete.birthYear,
                athlete.type,
                athlete.gender
              )}
            </h3>
            <button
              onClick={() => removeAthlete(athlete.id)}
              className="btn-danger"
            >
              Rimuovi Atleta
            </button>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th>Gara</th>
                    <th>Data</th>
                    <th>Stile</th>
                    <th>Distanza</th>
                    <th>Minuti</th>
                    <th>Secondi</th>
                    <th>Centesimi</th>
                    <th>Piazzamento</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {athlete.entries.map((entry, index) => (
                    <tr key={index} className="table-row">
                      <td>
                        <select
                          className="form-select"
                          value={entry.competitionName}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "competitionName",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Seleziona gara</option>
                          {races.map((race) => (
                            <option key={race.id} value={race.name}>
                              {race.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="form-input"
                          value={entry.date}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "date",
                              e.target.value
                            )
                          }
                          disabled={entry.competitionName !== ""}
                        />
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={entry.style}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "style",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Seleziona stile</option>
                          {styles.map((style) => (
                            <option key={style} value={style}>
                              {style}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={entry.distance}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "distance",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Seleziona distanza</option>
                          {distances.map((distance) => (
                            <option key={distance} value={distance}>
                              {distance}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-input w-20"
                          maxLength="2"
                          placeholder="00"
                          min="0"
                          value={entry.minutes}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "minutes",
                              e.target.value
                                .replace(/[^0-9]/g, "")
                                .substring(0, 2)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-input w-20"
                          maxLength="2"
                          placeholder="00"
                          min="0"
                          max="59"
                          value={entry.seconds}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "seconds",
                              e.target.value
                                .replace(/[^0-9]/g, "")
                                .substring(0, 2)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-input w-20"
                          maxLength="2"
                          placeholder="00"
                          min="0"
                          max="99"
                          value={entry.decimal}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "decimal",
                              e.target.value
                                .replace(/[^0-9]/g, "")
                                .substring(0, 2)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-input w-20"
                          min="1"
                          placeholder="#"
                          value={entry.placement}
                          onChange={(e) =>
                            updateEntry(
                              athlete.id,
                              index,
                              "placement",
                              e.target.value.replace(/[^0-9]/g, "")
                            )
                          }
                        />
                      </td>
                      <td className="space-x-2">
                        <button
                          type="button"
                          onClick={() => removeRow(athlete.id, index)}
                          className="btn-danger"
                        >
                          Rimuovi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveRow(athlete.id, index)}
                          className="btn-success"
                        >
                          Salva
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => addRow(athlete.id)}
                className="btn-secondary"
              >
                Aggiungi Riga
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Pulsante Salva Tutti fisso in basso */}
      {selectedAthletes.length > 0 && (
        <div className="fixed-bottom">
          <button
            type="button"
            onClick={handleSaveAll}
            className="save-all-button"
          >
            Salva Tutti i Risultati
          </button>
        </div>
      )}
    </div>
  );
}
