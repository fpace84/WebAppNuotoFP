import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import "./clothingManagement.css";

const clothingItems = [
  {
    name: "Maglietta",
    sizes: [
      "7-8 anni",
      "9-10 anni",
      "11-12 anni",
      "13-14 anni",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "Altro",
    ],
  },
  {
    name: "Pantaloncino",
    sizes: ["8 anni", "10 anni", "12 anni", "XS", "S", "M", "L", "XL", "Altro"],
  },
  { name: "Cuffia", sizes: ["Unica"] },
  {
    name: "Felpa",
    sizes: [
      "8-9 anni",
      "10-11 anni",
      "12-13 anni",
      "14-15 anni",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "Altro",
    ],
  },
  {
    name: "Pantaloni",
    sizes: ["4XS", "3XS", "2XS", "XS", "S", "M", "L", "XL", "Altro"],
  },
  {
    name: "Costume",
    sizes: ["4XS", "3XS", "2XS", "XS", "S", "M", "L", "XL", "Altro"],
  },
  { name: "Sacca", sizes: ["Unica"] },
];

export default function ClothingManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clothingState, setClothingState] = useState({});
  const [athleteName, setAthleteName] = useState("");
  const [athletes, setAthletes] = useState([]);

  useEffect(() => {
    const fetchAthletes = async () => {
      const querySnapshot = await getDocs(collection(db, "athletes"));
      const athletesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAthletes(athletesData);
    };

    fetchAthletes();
  }, []);

  useEffect(() => {
    const fetchAthleteData = async () => {
      if (id) {
        const athleteDoc = await getDoc(doc(db, "athletes", id));
        if (athleteDoc.exists()) {
          const athleteData = athleteDoc.data();
          setAthleteName(`${athleteData.name} ${athleteData.lastName}`);
        }

        const clothingDoc = await getDoc(doc(db, "athleteClothing", id));
        if (clothingDoc.exists()) {
          setClothingState(clothingDoc.data());
        } else {
          const initialState = clothingItems.reduce((acc, item) => {
            acc[item.name] = { size: "", quantity: 0, delivered: false };
            return acc;
          }, {});
          setClothingState(initialState);
        }
      }
    };

    fetchAthleteData();
  }, [id]);

  const handleChange = (item, field, value) => {
    setClothingState((prev) => ({
      ...prev,
      [item]: { ...prev[item], [field]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (id) {
      await setDoc(doc(db, "athleteClothing", id), clothingState);
      alert("Modifiche salvate con successo!");
      navigate(`/athlete/${id}`);
    } else {
      alert("Seleziona un atleta prima di salvare le modifiche.");
    }
  };

  if (!id) {
    return (
      <div className="clothing-management-wrapper">
        <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
          <div className="relative py-3 sm:max-w-xl sm:mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
            <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
              <h1 className="text-3xl font-bold text-gray-900 mb-6">
                Gestione Abbigliamento
              </h1>
              <h2 className="text-xl font-semibold mb-4">Seleziona un atleta:</h2>
              <ul className="space-y-2">
                {athletes.map((athlete) => (
                  <li key={athlete.id}>
                    <Link
                      to={`/clothing/${athlete.id}`}
                      className="text-blue-500 hover:text-blue-700 font-medium"
                    >
                      {athlete.name} {athlete.lastName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="clothing-management-wrapper">
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="relative py-3 sm:max-w-xl sm:mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
          <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">
              Gestione Abbigliamento
            </h1>
            <h2 className="text-xl font-semibold mb-4">Atleta: {athleteName}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {clothingItems.map((item) => (
                  <div
                    key={item.name}
                    className="bg-gray-50 p-4 rounded-lg shadow"
                  >
                    <h3 className="font-semibold mb-2 text-lg">{item.name}</h3>
                    <div className="clothing-controls">
                      <div className="control-row">
                        <select
                          className="size-select"
                          value={clothingState[item.name]?.size || ""}
                          onChange={(e) =>
                            handleChange(item.name, "size", e.target.value)
                          }
                        >
                          <option value="">Seleziona taglia</option>
                          {item.sizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        
                        {clothingState[item.name]?.size === "Altro" && (
                          <input
                            type="text"
                            className="custom-size-input"
                            placeholder="Inserisci taglia"
                            value={clothingState[item.name]?.customSize || ""}
                            onChange={(e) =>
                              handleChange(item.name, "customSize", e.target.value)
                            }
                          />
                        )}
                      </div>
                      
                      <div className="control-row">
                        <div className="quantity-container">
                          <span className="quantity-label">Quantità:</span>
                          <input
                            type="number"
                            className="quantity-input"
                            placeholder="Qtà"
                            value={clothingState[item.name]?.quantity || 0}
                            onChange={(e) =>
                              handleChange(
                                item.name,
                                "quantity",
                                parseInt(e.target.value) || 0
                              )
                            }
                            min="0"
                          />
                        </div>
                        
                        <div className="checkbox-container">
                          <input
                            type="checkbox"
                            id={`delivered-${item.name}`}
                            className="delivery-checkbox"
                            checked={clothingState[item.name]?.delivered || false}
                            onChange={(e) =>
                              handleChange(item.name, "delivered", e.target.checked)
                            }
                          />
                          <label htmlFor={`delivered-${item.name}`} className="delivery-label">
                            Consegnato
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="button-container">
                <button
                  type="button"
                  onClick={() => navigate(`/athlete/${id}`)}
                  className="cancel-button"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="save-button"
                >
                  Salva Modifiche
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}