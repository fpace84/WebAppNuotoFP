import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import "./NewCompetition.css";

export default function NewCompetition() {
  const navigate = useNavigate();
  const [competitionData, setCompetitionData] = useState({
    name: "",
    subtitle: "",
    dates: [""],
    location: "",
    types: [],
    level: "",
    registrationDeadline: "",
    status: "upcoming",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Gestisce i cambiamenti nei campi singoli
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCompetitionData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Gestisce l'aggiunta di una nuova data
  const addDate = () => {
    setCompetitionData((prev) => ({
      ...prev,
      dates: [...prev.dates, ""],
    }));
  };

  // Gestisce la modifica di una data esistente
  const updateDate = (index, value) => {
    const newDates = [...competitionData.dates];
    newDates[index] = value;

    // Ordina le date per trovare quella iniziale e finale
    const sortedDates = [...newDates].filter((d) => d).sort();
    const startDate = sortedDates.length > 0 ? sortedDates[0] : "";
    const endDate =
      sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : "";

    setCompetitionData((prev) => ({
      ...prev,
      dates: newDates,
      startDate,
      endDate,
    }));
  };

  // Gestisce la rimozione di una data
  const removeDate = (index) => {
    // Assicurati che ci sia sempre almeno una data
    if (competitionData.dates.length <= 1) return;

    const newDates = [...competitionData.dates];
    newDates.splice(index, 1);

    // Ricalcola date iniziale e finale
    const sortedDates = [...newDates].filter((d) => d).sort();
    const startDate = sortedDates.length > 0 ? sortedDates[0] : "";
    const endDate =
      sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : "";

    setCompetitionData((prev) => ({
      ...prev,
      dates: newDates,
      startDate,
      endDate,
    }));
  };

  // Gestisce la selezione delle tipologie
  const handleTypeToggle = (type) => {
    const currentTypes = [...competitionData.types];
    if (currentTypes.includes(type)) {
      // Se il tipo è già presente, rimuovilo
      setCompetitionData((prev) => ({
        ...prev,
        types: prev.types.filter((t) => t !== type),
      }));
    } else {
      // Altrimenti aggiungilo
      setCompetitionData((prev) => ({
        ...prev,
        types: [...prev.types, type],
      }));
    }
  };

  // Gestisce l'invio del form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Validazione
    if (
      !competitionData.name ||
      !competitionData.dates[0] ||
      !competitionData.location ||
      competitionData.types.length === 0 ||
      !competitionData.level ||
      !competitionData.registrationDeadline
    ) {
      setError("Compila tutti i campi obbligatori");
      setIsLoading(false);
      return;
    }

    try {
      // Calcola date iniziale e finale
      const sortedDates = [...competitionData.dates].filter((d) => d).sort();
      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];

      // Prepara l'oggetto da salvare
      const raceData = {
        ...competitionData,
        date: startDate, // Mantiene campo 'date' per retrocompatibilità
        startDate,
        endDate,
        type: competitionData.types.join(", "), // Campo 'type' per retrocompatibilità
        dates: competitionData.dates.filter((d) => d), // Rimuove date vuote
      };

      await addDoc(collection(db, "races"), raceData);
      alert("Gara inserita con successo!");
      navigate("/competitions");
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      setError("Si è verificato un errore durante il salvataggio. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  const competitionTypes = ["Agonista", "Propaganda"];
  const competitionLevels = ["Regionale", "Nazionale", "Internazionale"];

  return (
    <div className="new-competition-container">
      <div className="competition-form-card">
        <div className="form-header">
          <h2 className="form-title">Inserisci Nuova Gara</h2>
        </div>

        <form onSubmit={handleSubmit} className="competition-form">
          {/* Nome Gara */}
          <div className="form-field">
            <label className="form-label">Nome Gara</label>
            <input
              type="text"
              name="name"
              required
              value={competitionData.name}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          {/* Sottotitolo */}
          <div className="form-field">
            <label className="form-label">Sottotitolo (opzionale)</label>
            <input
              type="text"
              name="subtitle"
              value={competitionData.subtitle}
              onChange={handleChange}
              className="form-input"
              placeholder="Es: 2° Giornata"
            />
          </div>

          {/* Date */}
          <div className="form-field">
            <label className="form-label">Date della Competizione</label>

            <div className="dates-container">
              {competitionData.dates.map((date, index) => (
                <div key={index} className="date-input-group">
                  <input
                    type="date"
                    required={index === 0}
                    value={date}
                    onChange={(e) => updateDate(index, e.target.value)}
                    className="form-input"
                  />

                  {competitionData.dates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDate(index)}
                      className="remove-date-btn"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={addDate} className="add-date-btn">
              + Aggiungi un'altra data
            </button>
          </div>

          {/* Luogo */}
          <div className="form-field">
            <label className="form-label">Luogo</label>
            <input
              type="text"
              name="location"
              required
              value={competitionData.location}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          {/* Tipologia - Checkbox multiple */}
          <div className="form-field">
            <label className="form-label">Tipologia</label>
            <div className="checkbox-group">
              {competitionTypes.map((type) => (
                <div key={type} className="checkbox-item">
                  <input
                    type="checkbox"
                    id={`type-${type}`}
                    checked={competitionData.types.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                    className="checkbox-input"
                  />
                  <label htmlFor={`type-${type}`} className="checkbox-label">
                    {type}
                  </label>
                </div>
              ))}
            </div>
            {competitionData.types.length === 0 && (
              <p className="error-text">Seleziona almeno una tipologia</p>
            )}
          </div>

          {/* Livello */}
          <div className="form-field">
            <label className="form-label">Livello</label>
            <select
              name="level"
              required
              value={competitionData.level}
              onChange={handleChange}
              className="form-select"
            >
              <option value="">Seleziona un livello</option>
              {competitionLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          {/* Scadenza Iscrizione */}
          <div className="form-field">
            <label className="form-label">Scadenza Iscrizione</label>
            <input
              type="date"
              name="registrationDeadline"
              required
              value={competitionData.registrationDeadline}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          {/* Messaggi di Errore */}
          {error && <div className="error-message">{error}</div>}

          {/* Pulsanti */}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate("/competitions")}
              className="cancel-button"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? "Salvataggio in corso..." : "Salva Gara"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
