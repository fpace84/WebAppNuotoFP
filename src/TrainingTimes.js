import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { calculateCategory } from "./categories";

export default function TrainingTimes() {
  // Funzione per ottenere la data di oggi nel formato corretto
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [mode, setMode] = useState("individual");
  const [date, setDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(true);

  const [athletes, setAthletes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);

  const [individualEntries, setIndividualEntries] = useState([]);

  const [groupAthletes, setGroupAthletes] = useState([]);
  const [groupStyle, setGroupStyle] = useState("");
  const [groupDistance, setGroupDistance] = useState("");
  const [athletesPerHeat, setAthletesPerHeat] = useState(6);
  const [genderSeparation, setGenderSeparation] = useState("mixed");
  const [sortOrder, setSortOrder] = useState("fastest");
  const [heats, setHeats] = useState([]);
  const [heatsGenerated, setHeatsGenerated] = useState(false);
  const [heatTimes, setHeatTimes] = useState({});
  const [presentAthletes, setPresentAthletes] = useState([]);

  const styles = ["Stile libero", "Dorso", "Rana", "Farfalla", "Misto"];
  const distances = ["25m", "50m", "100m", "200m", "400m", "800m", "1500m"];

  useEffect(() => {
    const fetchAthletes = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, "athletes"));
        const athletesList = querySnapshot.docs
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
      } catch (error) {
        console.error("Errore nel caricamento degli atleti:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAthletes();
  }, []);

  useEffect(() => {
    const fetchPresentAthletes = async () => {
      if (mode === "group" && date) {
        try {
          const dateStart = new Date(date);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(date);
          dateEnd.setHours(23, 59, 59, 999);

          const attendanceRef = collection(db, "attendance");
          const attendanceSnapshot = await getDocs(attendanceRef);

          const presentIds = attendanceSnapshot.docs
            .filter((doc) => {
              const data = doc.data();
              const docDate = data.date.toDate
                ? data.date.toDate()
                : new Date(data.date);
              return (
                docDate >= dateStart &&
                docDate <= dateEnd &&
                data.present === "Presente"
              );
            })
            .map((doc) => doc.data().athleteId);

          setPresentAthletes(presentIds);
        } catch (error) {
          console.error("Errore nel caricamento delle presenze:", error);
        }
      }
    };

    fetchPresentAthletes();
  }, [mode, date]);

  const filteredAthletes = athletes.filter((athlete) => {
    if (selectedType && athlete.type !== selectedType) return false;
    if (selectedCategories.length > 0) {
      const category = calculateCategory(
        athlete.birthYear,
        athlete.type,
        athlete.gender
      );
      if (!selectedCategories.includes(category)) return false;
    }
    if (mode === "individual") {
      return !individualEntries.some((entry) => entry.id === athlete.id);
    } else {
      return presentAthletes.includes(athlete.id);
    }
    return true;
  });

  const availableCategories = [
    ...new Set(
      athletes
        .filter((a) => !selectedType || a.type === selectedType)
        .map((a) => calculateCategory(a.birthYear, a.type, a.gender))
    ),
  ].sort();

  const addIndividualAthlete = (athleteId) => {
    const athlete = athletes.find((a) => a.id === athleteId);
    if (athlete) {
      setIndividualEntries((prev) => [
        ...prev,
        {
          ...athlete,
          times: [
            { style: "", distance: "", minutes: "", seconds: "", decimal: "" },
          ],
        },
      ]);
    }
  };

  const removeIndividualAthlete = (athleteId) => {
    setIndividualEntries((prev) =>
      prev.filter((entry) => entry.id !== athleteId)
    );
  };

  const addIndividualTime = (athleteId) => {
    setIndividualEntries((prev) =>
      prev.map((entry) => {
        if (entry.id === athleteId) {
          return {
            ...entry,
            times: [
              ...entry.times,
              {
                style: "",
                distance: "",
                minutes: "",
                seconds: "",
                decimal: "",
              },
            ],
          };
        }
        return entry;
      })
    );
  };

  const updateIndividualTime = (athleteId, timeIndex, field, value) => {
    setIndividualEntries((prev) =>
      prev.map((entry) => {
        if (entry.id === athleteId) {
          const newTimes = [...entry.times];
          newTimes[timeIndex] = { ...newTimes[timeIndex], [field]: value };
          return { ...entry, times: newTimes };
        }
        return entry;
      })
    );
  };

  const getBestTimes = async (athleteIds, style, distance) => {
    const timesMap = {};

    for (const athleteId of athleteIds) {
      try {
        const q = query(
          collection(db, "trainingTimes"),
          where("athleteId", "==", athleteId),
          where("style", "==", style),
          where("distance", "==", distance)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const times = snapshot.docs.map((doc) => doc.data().timeFormatted);
          const bestTime = times.sort((a, b) => {
            return parseTimeToSeconds(a) - parseTimeToSeconds(b);
          })[0];
          timesMap[athleteId] = bestTime;
        }
      } catch (error) {
        console.error("Errore recupero tempi:", error);
      }
    }

    return timesMap;
  };

  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr) return Infinity;
    const parts = timeStr.match(/(\d+)'(\d+)"(\d+)|(\d+)"(\d+)/);
    if (!parts) return Infinity;

    if (parts[1]) {
      return (
        parseInt(parts[1]) * 60 + parseInt(parts[2]) + parseInt(parts[3]) / 100
      );
    } else {
      return parseInt(parts[4]) + parseInt(parts[5]) / 100;
    }
  };

  const generateHeats = async () => {
    if (!groupStyle || !groupDistance) {
      alert("Seleziona stile e distanza prima di generare le batterie");
      return;
    }

    const athletesToUse = filteredAthletes.filter(
      (a) => mode === "group" && presentAthletes.includes(a.id)
    );

    if (athletesToUse.length === 0) {
      alert("Nessun atleta presente corrisponde ai filtri selezionati");
      return;
    }

    setLoading(true);

    try {
      const bestTimes = await getBestTimes(
        athletesToUse.map((a) => a.id),
        groupStyle,
        groupDistance
      );

      let athleteGroups = [];

      if (genderSeparation === "separated") {
        const males = athletesToUse.filter(
          (a) => a.gender === "M" || a.gender === "Maschio" || a.gender === "m"
        );
        const females = athletesToUse.filter(
          (a) => a.gender === "F" || a.gender === "Femmina" || a.gender === "f"
        );

        if (males.length > 0)
          athleteGroups.push({ gender: "M", athletes: males });
        if (females.length > 0)
          athleteGroups.push({ gender: "F", athletes: females });
      } else {
        athleteGroups = [{ gender: "mixed", athletes: athletesToUse }];
      }

      const allHeats = [];

      for (const group of athleteGroups) {
        const sortedAthletes = [...group.athletes].sort((a, b) => {
          const timeA = parseTimeToSeconds(bestTimes[a.id]);
          const timeB = parseTimeToSeconds(bestTimes[b.id]);

          if (sortOrder === "fastest") {
            return timeA - timeB;
          } else {
            return timeB - timeA;
          }
        });

        const groupHeats = [];
        let currentIndex = 0;

        while (currentIndex < sortedAthletes.length) {
          const remainingAthletes = sortedAthletes.length - currentIndex;

          if (remainingAthletes === 1 && groupHeats.length > 0) {
            groupHeats[groupHeats.length - 1].athletes.push(
              sortedAthletes[currentIndex]
            );
            break;
          }

          if (
            remainingAthletes > 1 &&
            remainingAthletes <= athletesPerHeat + 1 &&
            remainingAthletes > athletesPerHeat
          ) {
            const half = Math.ceil(remainingAthletes / 2);
            groupHeats.push({
              heatNumber: groupHeats.length + 1,
              gender: group.gender,
              athletes: sortedAthletes.slice(currentIndex, currentIndex + half),
            });
            groupHeats.push({
              heatNumber: groupHeats.length + 1,
              gender: group.gender,
              athletes: sortedAthletes.slice(currentIndex + half),
            });
            break;
          }

          groupHeats.push({
            heatNumber: groupHeats.length + 1,
            gender: group.gender,
            athletes: sortedAthletes.slice(
              currentIndex,
              currentIndex + athletesPerHeat
            ),
          });

          currentIndex += athletesPerHeat;
        }

        allHeats.push(...groupHeats);
      }

      allHeats.forEach((heat, index) => {
        heat.heatNumber = index + 1;
      });

      setHeats(allHeats);
      setHeatsGenerated(true);

      const newHeatTimes = {};
      allHeats.forEach((heat) => {
        heat.athletes.forEach((athlete) => {
          newHeatTimes[athlete.id] = { minutes: "", seconds: "", decimal: "" };
        });
      });
      setHeatTimes(newHeatTimes);

      alert(
        `Batterie generate con successo: ${allHeats.length} batterie totali`
      );
    } catch (error) {
      console.error("Errore generazione batterie:", error);
      alert("Errore nella generazione delle batterie: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateHeatTime = (athleteId, field, value) => {
    setHeatTimes((prev) => ({
      ...prev,
      [athleteId]: { ...prev[athleteId], [field]: value },
    }));
  };

  const formatTime = (minutes, seconds, decimal) => {
    if (!minutes && !seconds) return "";
    if (!minutes || parseInt(minutes) === 0) {
      return `${seconds}"${decimal || "00"}`;
    }
    return `${minutes}'${seconds}"${decimal || "00"}`;
  };

  const handleSaveIndividualTime = async (athleteId, timeIndex) => {
    try {
      const entry = individualEntries.find((e) => e.id === athleteId);
      const time = entry.times[timeIndex];

      if (!time.style || !time.distance || (!time.seconds && !time.minutes)) {
        alert("Compila tutti i campi obbligatori");
        return;
      }

      const timeFormatted = formatTime(
        time.minutes || "00",
        time.seconds || "00",
        time.decimal || "00"
      );

      await addDoc(collection(db, "trainingTimes"), {
        athleteId,
        athleteName: `${entry.name} ${entry.lastName}`,
        date,
        style: time.style,
        distance: time.distance,
        timeFormatted,
        createdAt: new Date(),
      });

      setIndividualEntries((prev) =>
        prev.map((e) => {
          if (e.id === athleteId) {
            const newTimes = [...e.times];
            newTimes[timeIndex] = {
              style: "",
              distance: "",
              minutes: "",
              seconds: "",
              decimal: "",
            };
            return { ...e, times: newTimes };
          }
          return e;
        })
      );

      alert("Tempo salvato con successo!");
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio del tempo");
    }
  };

  const handleSaveAllIndividualTimes = async () => {
    try {
      let savedCount = 0;

      for (const athlete of individualEntries) {
        for (const time of athlete.times) {
          if (!time.style || !time.distance || (!time.seconds && !time.minutes))
            continue;

          const timeFormatted = formatTime(
            time.minutes || "00",
            time.seconds || "00",
            time.decimal || "00"
          );

          await addDoc(collection(db, "trainingTimes"), {
            athleteId: athlete.id,
            athleteName: `${athlete.name} ${athlete.lastName}`,
            date,
            style: time.style,
            distance: time.distance,
            timeFormatted,
            createdAt: new Date(),
          });

          savedCount++;
        }
      }

      if (savedCount > 0) {
        alert(`Salvati ${savedCount} tempi con successo!`);
        setIndividualEntries([]);
      } else {
        alert("Nessun tempo valido da salvare");
      }
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio dei tempi");
    }
  };

  const handleSaveAllHeats = async () => {
    try {
      let savedCount = 0;

      for (const heat of heats) {
        for (const athlete of heat.athletes) {
          const time = heatTimes[athlete.id];
          if (!time || (!time.seconds && !time.minutes)) continue;

          const timeFormatted = formatTime(
            time.minutes || "00",
            time.seconds || "00",
            time.decimal || "00"
          );

          await addDoc(collection(db, "trainingTimes"), {
            athleteId: athlete.id,
            athleteName: `${athlete.name} ${athlete.lastName}`,
            date,
            style: groupStyle,
            distance: groupDistance,
            timeFormatted,
            createdAt: new Date(),
          });

          savedCount++;
        }
      }

      if (savedCount > 0) {
        alert(`Salvati ${savedCount} tempi con successo!`);
        setGroupAthletes([]);
        setHeats([]);
        setHeatsGenerated(false);
        setHeatTimes({});
        setGroupStyle("");
        setGroupDistance("");
      } else {
        alert("Nessun tempo valido da salvare");
      }
    } catch (error) {
      console.error("Errore durante il salvataggio:", error);
      alert("Errore durante il salvataggio dei tempi");
    }
  };

  if (loading && athletes.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", fontSize: "18px" }}>
        Caricamento...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "100%",
        margin: "0 auto",
        padding: "16px",
        paddingBottom: "80px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          position: "sticky",
          top: 0,
          backgroundColor: "white",
          zIndex: 100,
          padding: "8px 0",
        }}
      >
        <button
          onClick={() => {
            setMode("individual");
            setIndividualEntries([]);
            setGroupAthletes([]);
            setHeats([]);
            setHeatsGenerated(false);
          }}
          style={{
            flex: 1,
            padding: "16px",
            fontSize: "16px",
            fontWeight: "600",
            border: "2px solid #007AFF",
            borderRadius: "12px",
            backgroundColor: mode === "individual" ? "#007AFF" : "white",
            color: mode === "individual" ? "white" : "#007AFF",
            cursor: "pointer",
          }}
        >
          Individuale
        </button>
        <button
          onClick={() => {
            setMode("group");
            setIndividualEntries([]);
            setGroupAthletes([]);
            setHeats([]);
            setHeatsGenerated(false);
          }}
          style={{
            flex: 1,
            padding: "16px",
            fontSize: "16px",
            fontWeight: "600",
            border: "2px solid #007AFF",
            borderRadius: "12px",
            backgroundColor: mode === "group" ? "#007AFF" : "white",
            color: mode === "group" ? "white" : "#007AFF",
            cursor: "pointer",
          }}
        >
          Gruppo/Batterie
        </button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              fontSize: "15px",
            }}
          >
            Data Allenamento
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              fontSize: "15px",
            }}
          >
            Tipologia
          </label>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setSelectedCategories([]);
            }}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
            }}
          >
            <option value="">Tutte</option>
            <option value="Agonista">Agonista</option>
            <option value="Propaganda">Propaganda</option>
          </select>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              fontSize: "15px",
            }}
          >
            Categorie
          </label>
          <select
            multiple
            value={selectedCategories}
            onChange={(e) => {
              const values = Array.from(
                e.target.selectedOptions,
                (option) => option.value
              );
              setSelectedCategories(values);
            }}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              minHeight: "100px",
            }}
          >
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <small
            style={{
              display: "block",
              marginTop: "4px",
              color: "#666",
              fontSize: "12px",
            }}
          >
            Tieni premuto Ctrl (o Cmd su Mac) per selezionare più categorie
          </small>
        </div>

        {mode === "group" && !heatsGenerated && (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                Stile
              </label>
              <select
                value={groupStyle}
                onChange={(e) => setGroupStyle(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value="">Seleziona stile</option>
                {styles.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                Distanza
              </label>
              <select
                value={groupDistance}
                onChange={(e) => setGroupDistance(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value="">Seleziona distanza</option>
                {distances.map((distance) => (
                  <option key={distance} value={distance}>
                    {distance}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                Atleti per batteria
              </label>
              <select
                value={athletesPerHeat}
                onChange={(e) => setAthletesPerHeat(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value={2}>2 atleti</option>
                <option value={3}>3 atleti</option>
                <option value={4}>4 atleti</option>
                <option value={5}>5 atleti</option>
                <option value={6}>6 atleti</option>
                <option value={7}>7 atleti</option>
                <option value={8}>8 atleti</option>
                <option value={9}>9 atleti</option>
                <option value={10}>10 atleti</option>
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                Divisione per sesso
              </label>
              <select
                value={genderSeparation}
                onChange={(e) => setGenderSeparation(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value="mixed">Batterie miste</option>
                <option value="separated">Batterie separate M/F</option>
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                Ordinamento
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value="fastest">Dal più veloce al più lento</option>
                <option value="slowest">Dal più lento al più veloce</option>
              </select>
            </div>
          </>
        )}

        {!heatsGenerated && (
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                fontSize: "15px",
              }}
            >
              {mode === "individual"
                ? "Aggiungi Atleta"
                : "Atleti Presenti Filtrati"}
            </label>
            {mode === "individual" ? (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addIndividualAthlete(e.target.value);
                    e.target.value = "";
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <option value="">Seleziona...</option>
                {filteredAthletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.lastName} {athlete.name}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "8px",
                  fontSize: "15px",
                  color: "#666",
                }}
              >
                {filteredAthletes.length} atleti verranno inclusi nelle batterie
              </div>
            )}
          </div>
        )}
      </div>

      {mode === "individual" && individualEntries.length > 0 && (
        <div>
          {individualEntries.map((athlete) => (
            <div
              key={athlete.id}
              style={{
                marginBottom: "20px",
                padding: "16px",
                backgroundColor: "#f8f9fa",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: "600", fontSize: "16px" }}>
                  {athlete.lastName} {athlete.name}
                </div>
                <button
                  onClick={() => removeIndividualAthlete(athlete.id)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    color: "#ff3b30",
                    backgroundColor: "white",
                    border: "1px solid #ff3b30",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Rimuovi
                </button>
              </div>

              {athlete.times.map((time, timeIndex) => (
                <div
                  key={timeIndex}
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    backgroundColor: "white",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <select
                      value={time.style}
                      onChange={(e) =>
                        updateIndividualTime(
                          athlete.id,
                          timeIndex,
                          "style",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <option value="">Stile</option>
                      {styles.map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </select>

                    <select
                      value={time.distance}
                      onChange={(e) =>
                        updateIndividualTime(
                          athlete.id,
                          timeIndex,
                          "distance",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                      }}
                    >
                      <option value="">Distanza</option>
                      {distances.map((distance) => (
                        <option key={distance} value={distance}>
                          {distance}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Min
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={time.minutes}
                        onChange={(e) =>
                          updateIndividualTime(
                            athlete.id,
                            timeIndex,
                            "minutes",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Sec
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={time.seconds}
                        onChange={(e) =>
                          updateIndividualTime(
                            athlete.id,
                            timeIndex,
                            "seconds",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Dec
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={time.decimal}
                        onChange={(e) =>
                          updateIndividualTime(
                            athlete.id,
                            timeIndex,
                            "decimal",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() =>
                        setIndividualEntries((prev) =>
                          prev.map((e) => {
                            if (e.id === athlete.id) {
                              return {
                                ...e,
                                times: e.times.filter(
                                  (_, i) => i !== timeIndex
                                ),
                              };
                            }
                            return e;
                          })
                        )
                      }
                      style={{
                        flex: 1,
                        padding: "12px",
                        fontSize: "16px",
                        color: "#ff3b30",
                        backgroundColor: "white",
                        border: "1px solid #ff3b30",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      Rimuovi Tempo
                    </button>
                    <button
                      onClick={() =>
                        handleSaveIndividualTime(athlete.id, timeIndex)
                      }
                      style={{
                        flex: 1,
                        padding: "12px",
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "white",
                        backgroundColor: "#34c759",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      Salva
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => addIndividualTime(athlete.id)}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "16px",
                  color: "#007AFF",
                  backgroundColor: "white",
                  border: "2px dashed #007AFF",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                + Aggiungi Tempo
              </button>
            </div>
          ))}

          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "16px",
              backgroundColor: "white",
              borderTop: "1px solid #ddd",
            }}
          >
            <button
              onClick={handleSaveAllIndividualTimes}
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "18px",
                fontWeight: "600",
                color: "white",
                backgroundColor: "#007AFF",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              Salva Tutti i Tempi
            </button>
          </div>
        </div>
      )}

      {mode === "group" && !heatsGenerated && (
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={generateHeats}
            disabled={
              !groupStyle ||
              !groupDistance ||
              filteredAthletes.length === 0 ||
              loading
            }
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "18px",
              fontWeight: "600",
              color: "white",
              backgroundColor:
                !groupStyle ||
                !groupDistance ||
                filteredAthletes.length === 0 ||
                loading
                  ? "#ccc"
                  : "#007AFF",
              border: "none",
              borderRadius: "12px",
              cursor:
                !groupStyle ||
                !groupDistance ||
                filteredAthletes.length === 0 ||
                loading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading ? "Generazione in corso..." : "Genera Batterie"}
          </button>
        </div>
      )}

      {mode === "group" && heatsGenerated && heats.length > 0 && (
        <div>
          <div
            style={{
              padding: "12px",
              backgroundColor: "#007AFF",
              color: "white",
              borderRadius: "12px",
              marginBottom: "16px",
              textAlign: "center",
              fontWeight: "600",
              fontSize: "16px",
            }}
          >
            {groupStyle} - {groupDistance}
          </div>

          {heats.map((heat) => (
            <div
              key={heat.heatNumber}
              style={{
                marginBottom: "24px",
                padding: "16px",
                backgroundColor: "#f8f9fa",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  fontWeight: "700",
                  fontSize: "18px",
                  marginBottom: "16px",
                  color: "#007AFF",
                }}
              >
                Batteria {heat.heatNumber}
                {heat.gender !== "mixed" &&
                  ` - ${heat.gender === "M" ? "Maschi" : "Femmine"}`}
              </div>

              {heat.athletes.map((athlete, index) => (
                <div
                  key={athlete.id}
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    backgroundColor: "white",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: "600",
                      marginBottom: "12px",
                    }}
                  >
                    Corsia {index + 1}: {athlete.lastName} {athlete.name}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Min
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={heatTimes[athlete.id]?.minutes || ""}
                        onChange={(e) =>
                          updateHeatTime(
                            athlete.id,
                            "minutes",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Sec
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={heatTimes[athlete.id]?.seconds || ""}
                        onChange={(e) =>
                          updateHeatTime(
                            athlete.id,
                            "seconds",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          marginBottom: "4px",
                          color: "#666",
                        }}
                      >
                        Dec
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="00"
                        value={heatTimes[athlete.id]?.decimal || ""}
                        onChange={(e) =>
                          updateHeatTime(
                            athlete.id,
                            "decimal",
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 2)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "16px",
                          fontSize: "24px",
                          textAlign: "center",
                          border: "2px solid #007AFF",
                          borderRadius: "8px",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "16px",
              backgroundColor: "white",
              borderTop: "1px solid #ddd",
              display: "flex",
              gap: "8px",
            }}
          >
            <button
              onClick={() => {
                setHeatsGenerated(false);
                setHeats([]);
                setHeatTimes({});
              }}
              style={{
                flex: 1,
                padding: "16px",
                fontSize: "16px",
                fontWeight: "600",
                color: "#ff3b30",
                backgroundColor: "white",
                border: "2px solid #ff3b30",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              Rigenera
            </button>
            <button
              onClick={handleSaveAllHeats}
              style={{
                flex: 2,
                padding: "16px",
                fontSize: "18px",
                fontWeight: "600",
                color: "white",
                backgroundColor: "#34c759",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              Salva Tutti
            </button>
          </div>
        </div>
      )}

      {mode === "individual" && individualEntries.length === 0 && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#666",
            fontSize: "16px",
          }}
        >
          Aggiungi atleti per iniziare a inserire i tempi
        </div>
      )}

      {mode === "group" && !heatsGenerated && filteredAthletes.length === 0 && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#666",
            fontSize: "16px",
          }}
        >
          {presentAthletes.length === 0 ? (
            <>
              Nessun atleta presente per la data selezionata.
              <br />
              <small style={{ fontSize: "14px", color: "#999" }}>
                Registra prima le presenze per questa data.
              </small>
            </>
          ) : (
            "Nessun atleta presente corrisponde ai filtri selezionati"
          )}
        </div>
      )}
    </div>
  );
}
