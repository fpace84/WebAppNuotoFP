import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { calculateCategory } from "./categories";
import "./athleteList.css";

export default function AthleteList() {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("");
  const [userChildInfo, setUserChildInfo] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Stati per la modifica
  const [editMode, setEditMode] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    lastName: "",
    gender: "",
    type: "",
    birthYear: "",
  });

  // Carica le informazioni dell'utente
  useEffect(() => {
    const loadUserInfo = async () => {
      const userId = localStorage.getItem("auth_token");
      const role = localStorage.getItem("user_role");
      setUserRole(role);

      if (role === "user") {
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserChildInfo({
              name: userData.childName,
              lastName: userData.childLastName,
            });
          }
        } catch (error) {
          console.error("Errore nel recupero info utente:", error);
        }
      }
    };

    loadUserInfo();
  }, []);

  // Carica gli atleti
  useEffect(() => {
    const fetchAthletes = async () => {
      try {
        setLoading(true);
        const athletesRef = collection(db, "athletes");
        const athletesSnapshot = await getDocs(athletesRef);
        let athletesList = athletesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Usa la funzione importata da categories.js
            category: calculateCategory(data.birthYear, data.type, data.gender),
            archived: data.archived || false,
          };
        });

        // Ordina per cognome e nome
        athletesList.sort((a, b) => {
          const lastNameCompare = a.lastName
            .toLowerCase()
            .localeCompare(b.lastName.toLowerCase());
          if (lastNameCompare !== 0) return lastNameCompare;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        setAthletes(athletesList);
      } catch (error) {
        console.error("Errore nel caricamento degli atleti:", error);
        setError("Errore nel caricamento degli atleti");
      } finally {
        setLoading(false);
      }
    };

    fetchAthletes();
  }, []);

  // Filtra gli atleti
  const getFilteredAthletes = () => {
    let filtered = [...athletes];

    // Se è un utente normale (genitore), mostra solo il proprio figlio
    if (userRole === "user" && userChildInfo) {
      filtered = filtered.filter(
        (athlete) =>
          athlete.name === userChildInfo.name &&
          athlete.lastName === userChildInfo.lastName
      );
    } else {
      // Applica i filtri per admin e coach
      if (filterType) {
        filtered = filtered.filter((athlete) => athlete.type === filterType);
      }

      if (filterCategory) {
        filtered = filtered.filter(
          (athlete) => athlete.category === filterCategory
        );
      }

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter((athlete) =>
          `${athlete.name} ${athlete.lastName}`.toLowerCase().includes(search)
        );
      }

      // Filtra per archiviate/non archiviate
      filtered = filtered.filter(
        (athlete) => athlete.archived === showArchived
      );
    }

    return filtered;
  };

  // Funzione per aprire il modulo di modifica
  const handleEdit = (athlete) => {
    setEditMode(true);
    setEditingAthlete(athlete);
    setEditFormData({
      name: athlete.name,
      lastName: athlete.lastName,
      gender: athlete.gender,
      type: athlete.type,
      birthYear: athlete.birthYear.toString(), // Converto in stringa per il form
    });
  };

  // Funzione per gestire i cambiamenti nel form di modifica
  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData({
      ...editFormData,
      [name]: value,
    });
  };

  // Funzione per salvare le modifiche
  const handleSaveEdit = async () => {
    if (!editingAthlete) return;

    try {
      // Converte birthYear in numero
      const birthYearNum = parseInt(editFormData.birthYear);
      if (isNaN(birthYearNum)) {
        alert("L'anno di nascita deve essere un numero valido");
        return;
      }

      // Prepara i dati da aggiornare
      const updateData = {
        name: editFormData.name,
        lastName: editFormData.lastName,
        gender: editFormData.gender,
        type: editFormData.type,
        birthYear: birthYearNum,
      };

      // Aggiorna il documento in Firestore
      await updateDoc(doc(db, "athletes", editingAthlete.id), updateData);

      // Aggiorna lo stato locale
      setAthletes(
        athletes.map((athlete) =>
          athlete.id === editingAthlete.id
            ? {
                ...athlete,
                ...updateData,
                category: calculateCategory(
                  birthYearNum,
                  updateData.type,
                  updateData.gender
                ),
              }
            : athlete
        )
      );

      // Resetta lo stato di modifica
      setEditMode(false);
      setEditingAthlete(null);

      alert("Atleta aggiornato con successo!");
    } catch (error) {
      console.error("Errore durante l'aggiornamento dell'atleta:", error);
      alert("Errore durante l'aggiornamento dell'atleta");
    }
  };

  // Funzione per annullare la modifica
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditingAthlete(null);
  };

  // Funzioni di gestione
  const handleNavigateToAthleteDetails = (athleteId) => {
    navigate(`/athlete/${athleteId}`);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Sei sicuro di voler eliminare questo atleta?")) {
      try {
        await deleteDoc(doc(db, "athletes", id));
        setAthletes(athletes.filter((athlete) => athlete.id !== id));
      } catch (error) {
        console.error("Errore nell'eliminazione dell'atleta:", error);
        alert("Errore durante l'eliminazione dell'atleta");
      }
    }
  };

  const handleArchive = async (id) => {
    try {
      await updateDoc(doc(db, "athletes", id), {
        archived: true,
      });
      setAthletes(
        athletes.map((athlete) =>
          athlete.id === id ? { ...athlete, archived: true } : athlete
        )
      );
    } catch (error) {
      console.error("Errore durante l'archiviazione:", error);
      alert("Errore durante l'archiviazione dell'atleta");
    }
  };

  const handleRestore = async (id) => {
    try {
      await updateDoc(doc(db, "athletes", id), {
        archived: false,
      });
      setAthletes(
        athletes.map((athlete) =>
          athlete.id === id ? { ...athlete, archived: false } : athlete
        )
      );
    } catch (error) {
      console.error("Errore durante il recupero:", error);
      alert("Errore durante il recupero dell'atleta");
    }
  };

  if (loading) {
    return <div className="text-center py-4">Caricamento atleti...</div>;
  }

  if (error) {
    return <div className="text-center py-4 text-red-600">Errore: {error}</div>;
  }

  const filteredAthletes = getFilteredAthletes();

  // Anno corrente per la selezione dell'anno di nascita
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => currentYear - i);

  // Versione completa della parte superiore del componente AthleteList.js

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white rounded-xl shadow-md">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-900">
          {showArchived ? "Atleti Archiviati" : "Lista Atleti"}
        </h1>

        {/* Contenitore dei bottoni con spaziatura */}
        <div className="button-container">
          {userRole !== "user" && (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`action-button archive-button ${
                  showArchived ? "active" : ""
                }`}
              >
                {showArchived ? "Mostra Atleti Attivi" : "Mostra Archivio"}
              </button>

              {!showArchived && (
                <button
                  onClick={() => navigate("/new-athlete")}
                  className="action-button new-button"
                >
                  Aggiungi Nuovo Atleta
                </button>
              )}
            </>
          )}

          <button
            onClick={() => navigate("/dashboard")}
            className="action-button dashboard-button"
          >
            Vai alla Dashboard
          </button>
        </div>
      </div>

      {/* Il resto del componente resta invariato */}
      {userRole !== "user" && (
        <div className="mb-4 flex gap-4 justify-between">
          <input
            type="text"
            placeholder="Cerca atleta..."
            className="p-2 border rounded"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="p-2 border rounded"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">Tutte le categorie</option>
            {[...new Set(athletes.map((a) => a.category))]
              .sort()
              .map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
          </select>
          <select
            className="p-2 border rounded"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Tutte le tipologie</option>
            <option value="Agonista">Agonista</option>
            <option value="Propaganda">Propaganda</option>
          </select>
        </div>
      )}

      {/* Resto del componente... */}

      {/* Modal per modifica atleta */}
      {editMode && editingAthlete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Modifica Atleta</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditFormChange}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cognome
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={editFormData.lastName}
                  onChange={handleEditFormChange}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Genere
                </label>
                <select
                  name="gender"
                  value={editFormData.gender}
                  onChange={handleEditFormChange}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Seleziona</option>
                  <option value="Maschio">Maschio</option>
                  <option value="Femmina">Femmina</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipologia
                </label>
                <select
                  name="type"
                  value={editFormData.type}
                  onChange={handleEditFormChange}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Seleziona</option>
                  <option value="Agonista">Agonista</option>
                  <option value="Propaganda">Propaganda</option>
                  <option value="Master">Master</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anno di Nascita
                </label>
                <select
                  name="birthYear"
                  value={editFormData.birthYear}
                  onChange={handleEditFormChange}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Seleziona</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="table-header">Nome</th>
              <th className="table-header">Cognome</th>
              <th className="table-header">Genere</th>
              <th className="table-header">Tipologia</th>
              <th className="table-header">Anno di Nascita</th>
              <th className="table-header">Categoria</th>
              <th className="table-header">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredAthletes.map((athlete) => (
              <tr key={athlete.id} className="athlete-row">
                <td data-label="Nome" className="table-cell">
                  {athlete.name}
                </td>
                <td data-label="Cognome" className="table-cell">
                  {athlete.lastName}
                </td>
                <td data-label="Genere" className="table-cell">
                  {athlete.gender}
                </td>
                <td data-label="Tipologia" className="table-cell">
                  {athlete.type}
                </td>
                <td data-label="Anno di Nascita" className="table-cell">
                  {athlete.birthYear}
                </td>
                <td data-label="Categoria" className="table-cell">
                  {athlete.category}
                </td>
                <td className="actions-cell">
                  <div className="action-buttons">
                    <button
                      onClick={() => handleNavigateToAthleteDetails(athlete.id)}
                      className="btn-details"
                    >
                      Dettagli
                    </button>
                    {userRole !== "user" && (
                      <>
                        <button
                          onClick={() => handleEdit(athlete)}
                          className="btn-edit"
                        >
                          Modifica
                        </button>

                        {showArchived ? (
                          <button
                            onClick={() => handleRestore(athlete.id)}
                            className="btn-restore"
                          >
                            Recupera
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(athlete.id)}
                            className="btn-archive"
                          >
                            Archivia
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(athlete.id)}
                          className="btn-delete"
                        >
                          Elimina
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
