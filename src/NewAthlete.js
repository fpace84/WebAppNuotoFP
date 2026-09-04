import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import "./newAthlete.css";

export default function NewAthlete() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [athleteData, setAthleteData] = useState({
    name: "",
    lastName: "",
    gender: "",
    type: "",
    birthYear: "",
    notes: "",
  });

  const checkForDuplicate = async () => {
    const athletesRef = collection(db, "athletes");
    const q = query(
      athletesRef,
      where("name", "==", athleteData.name),
      where("lastName", "==", athleteData.lastName),
      where("gender", "==", athleteData.gender),
      where("birthYear", "==", Number(athleteData.birthYear))
    );

    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Verifica duplicati
      const isDuplicate = await checkForDuplicate();
      if (isDuplicate) {
        alert("Esiste già un atleta con questi dati anagrafici!");
        setLoading(false);
        return;
      }

      // Se non ci sono duplicati, procedi con la creazione
      await addDoc(collection(db, "athletes"), {
        ...athleteData,
        birthYear: Number(athleteData.birthYear),
        createdAt: new Date(),
      });

      alert("Atleta aggiunto con successo!");
      navigate("/athletes");
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio dell'atleta");
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => currentYear - i);

  const inputStyle =
    "mt-1 block w-full px-4 py-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900";
  const labelStyle = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="min-h-screen">
      <div className="form-container">
        <div className="form-card">
          <h2 className="form-title">Aggiungi Nuovo Atleta</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Nome</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={athleteData.name}
                  onChange={(e) =>
                    setAthleteData({ ...athleteData, name: e.target.value })
                  }
                />
              </div>

              <div className="form-field">
                <label className="form-label">Cognome</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={athleteData.lastName}
                  onChange={(e) =>
                    setAthleteData({ ...athleteData, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Genere</label>
                <select
                  required
                  className="form-select"
                  value={athleteData.gender}
                  onChange={(e) =>
                    setAthleteData({ ...athleteData, gender: e.target.value })
                  }
                >
                  <option value="">Seleziona</option>
                  <option value="Maschio">Maschio</option>
                  <option value="Femmina">Femmina</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Tipologia</label>
                <select
                  required
                  className="form-select"
                  value={athleteData.type}
                  onChange={(e) =>
                    setAthleteData({ ...athleteData, type: e.target.value })
                  }
                >
                  <option value="">Seleziona</option>
                  <option value="Agonista">Agonista</option>
                  <option value="Propaganda">Propaganda</option>
                  <option value="Master">Master</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Anno di Nascita</label>
              <select
                required
                className="form-select"
                value={athleteData.birthYear}
                onChange={(e) =>
                  setAthleteData({ ...athleteData, birthYear: e.target.value })
                }
              >
                <option value="">Seleziona</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Note</label>
              <textarea
                className="form-textarea"
                value={athleteData.notes}
                onChange={(e) =>
                  setAthleteData({ ...athleteData, notes: e.target.value })
                }
              ></textarea>
            </div>

            <div className="button-container">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                disabled={loading}
                className="button-cancel"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={loading}
                className="button-submit"
              >
                {loading ? "Salvataggio..." : "Aggiungi Atleta"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
