import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, query, getDocs, deleteDoc, doc } from "firebase/firestore";
import "./competitions.css";

export default function Competitions() {
  const navigate = useNavigate();
  const [races, setRaces] = useState([]);
  const [filter, setFilter] = useState("upcoming");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Funzione per formattare date
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";

    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Funzione per formattare più date
  const formatMultipleDates = (race) => {
    // Se abbiamo un array di date
    if (race.dates && Array.isArray(race.dates) && race.dates.length > 0) {
      // Se c'è solo una data
      if (race.dates.length === 1) {
        return formatDate(race.dates[0]);
      }

      // Se ci sono multiple date, mostra la prima e l'ultima
      const sortedDates = [...race.dates].sort();
      return `${formatDate(sortedDates[0])} - ${formatDate(
        sortedDates[sortedDates.length - 1]
      )}`;
    }

    // Retrocompatibilità con il vecchio formato
    return formatDate(race.date);
  };

  // Funzione per normalizzare le tipologie di competizione
  const getCompetitionTypes = (race) => {
    if (Array.isArray(race.types) && race.types.length > 0) {
      return race.types.join(", ");
    }
    return race.type || "";
  };

  // Gestione date
  const getFirstDate = (race) => {
    if (race.dates && Array.isArray(race.dates) && race.dates.length > 0) {
      return new Date(race.dates.sort()[0]);
    }
    return new Date(race.date);
  };

  const getLastDate = (race) => {
    if (race.dates && Array.isArray(race.dates) && race.dates.length > 0) {
      return new Date(race.dates.sort()[race.dates.length - 1]);
    }
    return new Date(race.date);
  };

  useEffect(() => {
    const fetchRaces = async () => {
      try {
        setLoading(true);
        const racesRef = collection(db, "races");
        const q = query(racesRef);
        const querySnapshot = await getDocs(q);
        const racesData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRaces(racesData);
      } catch (error) {
        console.error("Errore nel recupero delle competizioni:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRaces();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Sei sicuro di voler eliminare questa competizione?")) {
      try {
        await deleteDoc(doc(db, "races", id));
        setRaces(races.filter((race) => race.id !== id));
      } catch (error) {
        console.error("Errore nell'eliminazione della competizione:", error);
        alert("Errore durante l'eliminazione della competizione");
      }
    }
  };

  // Filtra e ordina le gare
  const filteredRaces = races
    .filter((race) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (filter === "upcoming") {
        const lastDate = getLastDate(race);
        return lastDate >= today;
      } else {
        const firstDate = getFirstDate(race);
        return firstDate < today;
      }
    })
    .filter(
      (race) =>
        race.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        race.location?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (filter === "upcoming") {
        return getFirstDate(a) - getFirstDate(b);
      } else {
        return getLastDate(b) - getLastDate(a);
      }
    });

  const handleNavigateToCompetitionResults = () => {
    navigate("/competition-results");
  };

  const handleNavigateToNewCompetition = () => {
    navigate("/new-competition");
  };

  return (
    <div className="competitions-container">
      <h1 className="competitions-title">Competizioni</h1>

      {/* Pulsanti di azione */}
      <div className="action-buttons">
        <button
          onClick={handleNavigateToCompetitionResults}
          className="results-button"
        >
          Inserisci Risultati
        </button>
        <button
          onClick={handleNavigateToNewCompetition}
          className="new-comp-button"
        >
          Inserisci Gara
        </button>
      </div>

      {/* Filtri */}
      <div className="filter-buttons">
        <button
          className={`filter-button ${filter === "upcoming" ? "active" : ""}`}
          onClick={() => setFilter("upcoming")}
        >
          Prossime Gare
        </button>
        <button
          className={`filter-button ${filter === "past" ? "active" : ""}`}
          onClick={() => setFilter("past")}
        >
          Gare Passate
        </button>
      </div>

      {/* Casella di ricerca */}
      <input
        type="text"
        placeholder="Cerca competizione..."
        className="search-input"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Elenco competizioni */}
      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : (
        <div className="competition-list">
          {filteredRaces.map((race) => (
            <div key={race.id} className="competition-card">
              <div className="competition-info">
                <h2 className="competition-name">{race.name}</h2>
                {race.subtitle && (
                  <p className="competition-subtitle">{race.subtitle}</p>
                )}
              </div>

              <div className="competition-date">
                {formatMultipleDates(race)}
              </div>

              <div className="competition-location">{race.location}</div>

              <div className="competition-type">
                {getCompetitionTypes(race)}
              </div>

              <div className="competition-level">{race.level}</div>

              <div className="competition-actions">
                <button
                  onClick={() => handleDelete(race.id)}
                  className="delete-button"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}

          {filteredRaces.length === 0 && (
            <div className="no-competitions">Nessuna competizione trovata</div>
          )}
        </div>
      )}
    </div>
  );
}
