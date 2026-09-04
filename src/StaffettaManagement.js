import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { calculateCategory } from "./categories";
import { formatTime, timeToMilliseconds } from "./FormatTime";
import "./staffettaManagement.css";

// Costanti per gli stili e le distanze
const STYLES = {
  stilelibero: "Stile libero",
  dorso: "Dorso",
  rana: "Rana",
  farfalla: "Farfalla",
};

const DISTANCES = ["25", "50", "100", "200"];

// Timeout per il caricamento (in millisecondi)
const LOADING_TIMEOUT = 10000; // 10 secondi

// Funzione per convertire millisecondi in formato tempo
function millisecondsToFormattedTime(ms) {
  if (!ms || ms === Infinity) return "-";

  const totalCentiseconds = Math.floor(ms);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const decimal = totalCentiseconds % 100;

  let result = "";
  if (minutes === 0) {
    result = seconds + '"' + String(decimal).padStart(2, "0");
  } else {
    result =
      minutes +
      "'" +
      String(seconds).padStart(2, "0") +
      '"' +
      String(decimal).padStart(2, "0");
  }
  return result;
}

const formatDate = (date) => {
  if (!date) return "N/A";
  if (date.toDate) return date.toDate().toLocaleDateString();
  return new Date(date).toLocaleDateString();
};

export default function StaffettaManagement() {
  // Stati principali
  const [activeTab, setActiveTab] = useState("auto");
  const [settings, setSettings] = useState({
    type: "",
    categories: [],
    staffettaType: "",
    distance: "",
    compositionType: "",
    gender: "",
  });

  // Stati per la classifica atleti
  const [rankingFilters, setRankingFilters] = useState({
    style: "",
    distance: "",
    categories: [],
    types: [],
  });
  const [rankingResults, setRankingResults] = useState([]);
  const [showRankingResults, setShowRankingResults] = useState(false);

  // Stati per la formazione manuale
  const [manualFormation, setManualFormation] = useState({
    athlete1: "",
    athlete2: "",
    athlete3: "",
    athlete4: "",
  });

  // Stati per i dati
  const [athletes, setAthletes] = useState([]);
  const [athleteTimes, setAthleteTimes] = useState({});
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Stati per il modale di sostituzione
  const [replacementModal, setReplacementModal] = useState({
    isOpen: false,
    formationIndex: null,
    position: null,
    currentAthleteId: null,
  });

  // Elenco degli atleti già utilizzati nelle formazioni
  const [usedAthletes, setUsedAthletes] = useState(new Set());

  // Categorie disponibili per la classifica basate sui tipi selezionati
  const [availableRankingCategories, setAvailableRankingCategories] = useState(
    []
  );

  // Effect per resettare gli atleti usati quando cambiano i parametri
  useEffect(() => {
    setUsedAthletes(new Set());
  }, [
    settings.type,
    settings.staffettaType,
    settings.distance,
    settings.categories,
    settings.compositionType,
  ]);

  // Effect per caricare le categorie quando cambia il tipo
  useEffect(() => {
    if (settings.type && athletes.length > 0) {
      const availableCategories = [
        ...new Set(
          athletes
            .filter((a) => a.type === settings.type)
            .map((a) => calculateCategory(a.birthYear, a.type, a.gender))
        ),
      ].sort();
      setCategories(availableCategories);
    } else {
      setCategories([]);
    }
  }, [settings.type, athletes]);

  // Effect per aggiornare le categorie disponibili nella classifica
  useEffect(() => {
    if (athletes.length > 0) {
      if (rankingFilters.types.length === 0) {
        // Mostra tutte le categorie se nessun tipo è selezionato
        const allCategories = [
          ...new Set(
            athletes.map((a) =>
              calculateCategory(a.birthYear, a.type, a.gender)
            )
          ),
        ].sort();
        setAvailableRankingCategories(allCategories);
      } else {
        // Mostra solo le categorie dei tipi selezionati
        const filteredCategories = [
          ...new Set(
            athletes
              .filter((a) => rankingFilters.types.includes(a.type))
              .map((a) => calculateCategory(a.birthYear, a.type, a.gender))
          ),
        ].sort();
        setAvailableRankingCategories(filteredCategories);
      }
    }
  }, [athletes, rankingFilters.types]);

  // Effect principale per il caricamento dei dati
  useEffect(() => {
    let isSubscribed = true;
    let timeoutId;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!db) {
          throw new Error("Errore di connessione al database");
        }

        const loadDataWithTimeout = Promise.race([
          Promise.all([
            getDocs(collection(db, "athletes")),
            getDocs(collection(db, "competitions")),
            getDocs(collection(db, "trainingTimes")),
          ]),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error("Timeout nel caricamento dei dati"));
            }, LOADING_TIMEOUT);
          }),
        ]);

        const [athletesSnap, competitionTimes, trainingTimes] =
          await loadDataWithTimeout;

        if (!isSubscribed) return;

        // Processa dati atleti (escludi quelli archiviati)
        const athletesList = athletesSnap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            category: calculateCategory(
              doc.data().birthYear,
              doc.data().type,
              doc.data().gender
            ),
          }))
          .filter((athlete) => !athlete.archived)
          .sort((a, b) => a.lastName.localeCompare(b.lastName));

        // Processa tempi
        const times = {};
        [...competitionTimes.docs, ...trainingTimes.docs].forEach((doc) => {
          const data = doc.data();
          if (!times[data.athleteId]) times[data.athleteId] = {};

          const style = data.style.toLowerCase().replace(/\s+/g, "");
          const distance = data.distance.replace("m", "");
          const timeKey = `${style}_${distance}`;

          if (
            !times[data.athleteId][timeKey] ||
            timeToMilliseconds(data.timeFormatted) <
              timeToMilliseconds(times[data.athleteId][timeKey].timeFormatted)
          ) {
            times[data.athleteId][timeKey] = {
              timeFormatted: data.timeFormatted,
              date: data.date,
              type:
                doc.ref.parent.id === "competitions" ? "gara" : "allenamento",
            };
          }
        });

        if (isSubscribed) {
          setAthletes(athletesList);
          setAthleteTimes(times);
          setDataLoaded(true);
          setLoading(false);
        }
      } catch (error) {
        console.error("Errore nel caricamento dati:", error);
        if (isSubscribed) {
          setError(
            error.message ||
              "Errore nel caricamento dei dati. Riprova più tardi."
          );
          setLoading(false);
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    loadData();

    return () => {
      isSubscribed = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const hasData = athletes.length > 0 && Object.keys(athleteTimes).length > 0;

  const getEligibleAthletes = useCallback(
    (formationAthletes = [], excludeAthletes = []) => {
      return athletes.filter((athlete) => {
        if (athlete.type !== settings.type) return false;
        if (
          settings.categories.length > 0 &&
          !settings.categories.includes(athlete.category)
        )
          return false;
        if (formationAthletes.includes(athlete.id)) return false;
        if (excludeAthletes.includes(athlete.id)) return false;
        // Escludi atleti già utilizzati in altre formazioni con gli stessi parametri
        if (usedAthletes.has(athlete.id)) return false;

        if (settings.compositionType === "single" && settings.gender) {
          if (
            athlete.gender !== (settings.gender === "M" ? "Maschio" : "Femmina")
          )
            return false;
        }

        if (settings.staffettaType === "mista") {
          const styles = ["dorso", "rana", "farfalla", "stilelibero"];
          const position = formationAthletes.length;
          const style = styles[position];
          const timeKey = `${style}_${settings.distance}`;
          return athleteTimes[athlete.id]?.[timeKey];
        }

        const timeKey = `stilelibero_${settings.distance}`;
        return athleteTimes[athlete.id]?.[timeKey];
      });
    },
    [athletes, athleteTimes, settings, usedAthletes]
  );

  const calculateBestFormation = useCallback(
    (eligibleAthletes) => {
      let allPossibleFormations = [];

      const generateFormations = (
        remaining,
        current = [],
        currentTime = 0,
        maleCount = 0,
        femaleCount = 0
      ) => {
        if (current.length === 4) {
          if (
            settings.compositionType === "mixed" &&
            (maleCount !== 2 || femaleCount !== 2)
          ) {
            return;
          }

          allPossibleFormations.push({
            formation: [...current],
            totalTime: currentTime,
          });

          return;
        }

        remaining.forEach((athlete, index) => {
          if (settings.compositionType === "mixed") {
            const newMaleCount =
              maleCount + (athlete.gender === "Maschio" ? 1 : 0);
            const newFemaleCount =
              femaleCount + (athlete.gender === "Femmina" ? 1 : 0);

            if (newMaleCount > 2 || newFemaleCount > 2) return;

            const remainingMalesNeeded = 2 - newMaleCount;
            const remainingFemalesNeeded = 2 - newFemaleCount;

            const remainingMales = remaining
              .slice(index + 1)
              .filter((a) => a.gender === "Maschio").length;
            const remainingFemales = remaining
              .slice(index + 1)
              .filter((a) => a.gender === "Femmina").length;

            if (
              remainingMales < remainingMalesNeeded ||
              remainingFemales < remainingFemalesNeeded
            ) {
              return;
            }
          }

          const style =
            settings.staffettaType === "mista"
              ? ["dorso", "rana", "farfalla", "stilelibero"][current.length]
              : "stilelibero";

          const timeKey = `${style}_${settings.distance}`;
          const timeData = athleteTimes[athlete.id][timeKey];

          if (!timeData) return;

          const time = timeToMilliseconds(timeData.timeFormatted);
          const newRemaining = [...remaining];
          newRemaining.splice(index, 1);

          generateFormations(
            newRemaining,
            [
              ...current,
              {
                athlete,
                style,
                time,
                bestTime: timeData.timeFormatted,
                bestTimeDate: timeData.date,
                type: timeData.type,
              },
            ],
            currentTime + time,
            maleCount + (athlete.gender === "Maschio" ? 1 : 0),
            femaleCount + (athlete.gender === "Femmina" ? 1 : 0)
          );
        });
      };

      generateFormations(eligibleAthletes);

      allPossibleFormations.sort((a, b) => a.totalTime - b.totalTime);

      if (allPossibleFormations.length === 0) return null;

      const bestFormation = allPossibleFormations[0];

      // Aggiungi gli atleti usati al set
      bestFormation.formation.forEach((pos) => {
        setUsedAthletes((prev) => new Set([...prev, pos.athlete.id]));
      });

      return {
        formation: bestFormation.formation,
        totalTime: bestFormation.totalTime,
        formattedTotalTime: millisecondsToFormattedTime(
          bestFormation.totalTime
        ),
      };
    },
    [athleteTimes, settings]
  );

  const handleCreateAutoFormation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (
        !settings.type ||
        !settings.staffettaType ||
        !settings.distance ||
        settings.categories.length === 0
      ) {
        throw new Error("Inserisci tutti i parametri necessari");
      }

      const eligibleAthletes = getEligibleAthletes();

      if (eligibleAthletes.length < 4) {
        throw new Error(
          "Non ci sono abbastanza atleti disponibili con tempi registrati per questa combinazione"
        );
      }

      const bestFormation = calculateBestFormation(eligibleAthletes);
      if (bestFormation) {
        setFormations((prev) => [...prev, bestFormation]);
        setActiveTab("formations");
      } else {
        throw new Error(
          "Non è stato possibile trovare una formazione valida con i criteri selezionati"
        );
      }
    } catch (error) {
      console.error("Errore durante il calcolo:", error);
      setError(error.message || "Errore durante il calcolo della formazione");
    } finally {
      setLoading(false);
    }
  }, [settings, getEligibleAthletes, calculateBestFormation]);

  const calculatePreviewTimes = useCallback(() => {
    if (
      !manualFormation.athlete1 ||
      !manualFormation.athlete2 ||
      !manualFormation.athlete3 ||
      !manualFormation.athlete4 ||
      !settings.staffettaType ||
      !settings.distance
    ) {
      return null;
    }

    const athleteIds = [
      manualFormation.athlete1,
      manualFormation.athlete2,
      manualFormation.athlete3,
      manualFormation.athlete4,
    ];

    if (new Set(athleteIds).size !== 4) {
      return { error: "Non puoi selezionare lo stesso atleta più volte" };
    }

    const formationTimes = [];
    let totalTimeMs = 0;
    let missingTimes = false;

    for (let i = 0; i < 4; i++) {
      const athleteId = athleteIds[i];
      const athlete = athletes.find((a) => a.id === athleteId);

      if (!athlete) {
        missingTimes = true;
        break;
      }

      const style =
        settings.staffettaType === "mista"
          ? ["dorso", "rana", "farfalla", "stilelibero"][i]
          : "stilelibero";

      const timeKey = `${style}_${settings.distance}`;
      const timeData = athleteTimes[athleteId]?.[timeKey];

      if (!timeData) {
        missingTimes = true;
        break;
      }

      const timeMs = timeToMilliseconds(timeData.timeFormatted);
      totalTimeMs += timeMs;

      formationTimes.push({
        athlete,
        style,
        time: timeMs,
        formattedTime: timeData.timeFormatted,
        date: timeData.date,
        type: timeData.type,
      });
    }

    if (missingTimes) {
      return {
        error:
          "Uno o più atleti non hanno tempi registrati per questa combinazione",
      };
    }

    return {
      formationTimes,
      totalTimeMs,
      formattedTotalTime: millisecondsToFormattedTime(totalTimeMs),
    };
  }, [manualFormation, athletes, athleteTimes, settings]);

  const handleCreateManualFormation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (
        !settings.type ||
        !settings.staffettaType ||
        !settings.distance ||
        settings.categories.length === 0 ||
        !manualFormation.athlete1 ||
        !manualFormation.athlete2 ||
        !manualFormation.athlete3 ||
        !manualFormation.athlete4
      ) {
        throw new Error("Completa tutti i campi per creare una formazione");
      }

      const athleteIds = [
        manualFormation.athlete1,
        manualFormation.athlete2,
        manualFormation.athlete3,
        manualFormation.athlete4,
      ];

      if (new Set(athleteIds).size !== 4) {
        throw new Error("Non puoi selezionare lo stesso atleta più volte");
      }

      if (settings.compositionType === "single") {
        const gender = settings.gender === "M" ? "Maschio" : "Femmina";
        for (const athleteId of athleteIds) {
          const athlete = athletes.find((a) => a.id === athleteId);
          if (athlete.gender !== gender) {
            throw new Error(
              `Per staffette dello stesso sesso, tutti gli atleti devono essere ${
                gender === "Maschio" ? "maschi" : "femmine"
              }`
            );
          }
        }
      } else if (settings.compositionType === "mixed") {
        const genders = athleteIds.map((id) => {
          const athlete = athletes.find((a) => a.id === id);
          return athlete.gender;
        });

        const maleCount = genders.filter((g) => g === "Maschio").length;
        if (maleCount !== 2) {
          throw new Error(
            "Per staffette miste, devi selezionare esattamente 2 maschi e 2 femmine"
          );
        }
      }

      const formation = [];
      let totalTime = 0;

      for (let i = 0; i < 4; i++) {
        const athleteId = athleteIds[i];
        const athlete = athletes.find((a) => a.id === athleteId);

        const style =
          settings.staffettaType === "mista"
            ? ["dorso", "rana", "farfalla", "stilelibero"][i]
            : "stilelibero";

        const timeKey = `${style}_${settings.distance}`;
        const timeData = athleteTimes[athleteId]?.[timeKey];

        if (!timeData) {
          throw new Error(
            `L'atleta ${athlete.name} ${athlete.lastName} non ha un tempo registrato per ${STYLES[style]} ${settings.distance}m`
          );
        }

        const time = timeToMilliseconds(timeData.timeFormatted);
        totalTime += time;

        formation.push({
          athlete,
          style,
          time,
          bestTime: timeData.timeFormatted,
          bestTimeDate: timeData.date,
          type: timeData.type,
        });
      }

      const newFormation = {
        formation,
        totalTime,
        formattedTotalTime: millisecondsToFormattedTime(totalTime),
      };

      setFormations((prev) => [...prev, newFormation]);
      setActiveTab("formations");

      setManualFormation({
        athlete1: "",
        athlete2: "",
        athlete3: "",
        athlete4: "",
      });
    } catch (error) {
      console.error("Errore nella creazione della formazione:", error);
      setError(error.message || "Errore nella creazione della formazione");
    } finally {
      setLoading(false);
    }
  }, [settings, manualFormation, athletes, athleteTimes]);

  const getEligibleFractionistAthletes = useCallback(
    (position) => {
      const selectedAthletes = [
        manualFormation.athlete1,
        manualFormation.athlete2,
        manualFormation.athlete3,
        manualFormation.athlete4,
      ].filter((id, idx) => id && idx !== position - 1);

      const selectedAthleteObjects = selectedAthletes
        .map((id) => athletes.find((a) => a.id === id))
        .filter((a) => a);

      const maleCount = selectedAthleteObjects.filter(
        (a) => a.gender === "Maschio"
      ).length;

      const femaleCount = selectedAthleteObjects.filter(
        (a) => a.gender === "Femmina"
      ).length;

      const style =
        settings.staffettaType === "mista"
          ? ["dorso", "rana", "farfalla", "stilelibero"][position - 1]
          : "stilelibero";

      return athletes
        .filter((athlete) => {
          if (selectedAthletes.includes(athlete.id)) return false;

          if (athlete.type !== settings.type) return false;
          if (
            settings.categories.length > 0 &&
            !settings.categories.includes(athlete.category)
          )
            return false;

          const timeKey = `${style}_${settings.distance}`;
          if (!athleteTimes[athlete.id]?.[timeKey]) return false;

          if (settings.compositionType === "mixed") {
            if (athlete.gender === "Maschio" && maleCount >= 2) return false;
            if (athlete.gender === "Femmina" && femaleCount >= 2) return false;
          } else if (settings.compositionType === "single") {
            const requiredGender =
              settings.gender === "M" ? "Maschio" : "Femmina";
            if (athlete.gender !== requiredGender) return false;
          }

          return true;
        })
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
    },
    [athletes, athleteTimes, settings, manualFormation]
  );

  const getStyleForPosition = useCallback(
    (position) => {
      if (settings.staffettaType === "mista") {
        const styles = ["dorso", "rana", "farfalla", "stilelibero"];
        return STYLES[styles[position - 1]] || "";
      }
      return "Stile libero";
    },
    [settings]
  );

  const handleOpenReplaceModal = useCallback(
    (formationIndex, position, athleteId) => {
      setReplacementModal({
        isOpen: true,
        formationIndex,
        position,
        currentAthleteId: athleteId,
      });
    },
    []
  );

  const getReplacementCandidates = useCallback(() => {
    if (!replacementModal.isOpen) return [];

    const formation = formations[replacementModal.formationIndex];
    const style =
      settings.staffettaType === "mista"
        ? ["dorso", "rana", "farfalla", "stilelibero"][
            replacementModal.position
          ]
        : "stilelibero";

    const formationAthleteIds = formation.formation.map(
      (pos) => pos.athlete.id
    );
    formationAthleteIds.splice(replacementModal.position, 1);

    const currentMaleCount = formation.formation.filter(
      (pos, idx) =>
        idx !== replacementModal.position && pos.athlete.gender === "Maschio"
    ).length;
    const currentFemaleCount = formation.formation.filter(
      (pos, idx) =>
        idx !== replacementModal.position && pos.athlete.gender === "Femmina"
    ).length;

    return athletes.filter((athlete) => {
      if (athlete.type !== settings.type) return false;
      if (
        settings.categories.length > 0 &&
        !settings.categories.includes(athlete.category)
      )
        return false;
      if (formationAthleteIds.includes(athlete.id)) return false;
      if (athlete.id === replacementModal.currentAthleteId) return false;

      const timeKey = `${style}_${settings.distance}`;
      if (!athleteTimes[athlete.id]?.[timeKey]) return false;

      if (settings.compositionType === "mixed") {
        if (athlete.gender === "Maschio" && currentMaleCount >= 2) return false;
        if (athlete.gender === "Femmina" && currentFemaleCount >= 2)
          return false;
      } else if (settings.compositionType === "single") {
        const requiredGender = settings.gender === "M" ? "Maschio" : "Femmina";
        if (athlete.gender !== requiredGender) return false;
      }

      return true;
    });
  }, [replacementModal, formations, settings, athletes, athleteTimes]);

  const handleReplaceAthlete = useCallback(
    (newAthleteId) => {
      try {
        const { formationIndex, position } = replacementModal;
        const formationToUpdate = formations[formationIndex];

        const newAthlete = athletes.find((a) => a.id === newAthleteId);
        if (!newAthlete) {
          throw new Error("Atleta non trovato");
        }

        const style =
          settings.staffettaType === "mista"
            ? ["dorso", "rana", "farfalla", "stilelibero"][position]
            : "stilelibero";

        const timeKey = `${style}_${settings.distance}`;
        const timeData = athleteTimes[newAthleteId][timeKey];
        if (!timeData) {
          throw new Error("Tempo non trovato per questo stile");
        }

        const updatedFormation = {
          ...formationToUpdate,
          formation: [...formationToUpdate.formation],
        };

        updatedFormation.formation[position] = {
          athlete: newAthlete,
          style,
          time: timeToMilliseconds(timeData.timeFormatted),
          bestTime: timeData.timeFormatted,
          bestTimeDate: timeData.date,
          type: timeData.type,
        };

        updatedFormation.totalTime = updatedFormation.formation.reduce(
          (total, pos) => total + pos.time,
          0
        );
        updatedFormation.formattedTotalTime = millisecondsToFormattedTime(
          updatedFormation.totalTime
        );

        const newFormations = [...formations];
        newFormations[formationIndex] = updatedFormation;
        setFormations(newFormations);

        setReplacementModal({
          isOpen: false,
          formationIndex: null,
          position: null,
          currentAthleteId: null,
        });
      } catch (error) {
        console.error("Errore durante la sostituzione:", error);
        setError(error.message || "Errore durante la sostituzione dell'atleta");
        setTimeout(() => setError(null), 3000);
      }
    },
    [replacementModal, formations, athletes, athleteTimes, settings]
  );

  const handleRemoveFormation = useCallback((index) => {
    setFormations((prev) => {
      const newFormations = [...prev];
      const removedFormation = newFormations[index];
      if (removedFormation) {
        // Rimuovi gli atleti dal set degli usati
        removedFormation.formation.forEach((pos) => {
          setUsedAthletes((prev) => {
            const newSet = new Set(prev);
            newSet.delete(pos.athlete.id);
            return newSet;
          });
        });
      }
      newFormations.splice(index, 1);
      return newFormations;
    });
  }, []);

  const handleReset = useCallback(() => {
    setFormations([]);
    setUsedAthletes(new Set());
    setSettings({
      type: "",
      categories: [],
      staffettaType: "",
      distance: "",
      compositionType: "",
      gender: "",
    });
    setManualFormation({
      athlete1: "",
      athlete2: "",
      athlete3: "",
      athlete4: "",
    });
    setActiveTab("auto");
  }, []);

  // Funzione per generare la classifica degli atleti
  const generateAthletesRanking = useCallback(() => {
    const { style, distance, categories, types } = rankingFilters;

    if (!style || !distance) return [];

    const timeKey = `${style}_${distance}`;

    const rankedAthletes = athletes
      .filter((athlete) => {
        // Filtra per tipi se specificati
        if (types.length > 0 && !types.includes(athlete.type)) return false;

        // Filtra per categorie se specificate
        if (categories.length > 0 && !categories.includes(athlete.category))
          return false;

        // Verifica che l'atleta abbia un tempo per questa combinazione
        return athleteTimes[athlete.id]?.[timeKey];
      })
      .map((athlete) => {
        const timeData = athleteTimes[athlete.id][timeKey];
        return {
          athlete,
          timeData,
          timeMs: timeToMilliseconds(timeData.timeFormatted),
        };
      })
      .sort((a, b) => a.timeMs - b.timeMs);

    return rankedAthletes;
  }, [athletes, athleteTimes, rankingFilters]);

  const handleGenerateRanking = useCallback(() => {
    const results = generateAthletesRanking();
    setRankingResults(results);
    setShowRankingResults(true);
  }, [generateAthletesRanking]);

  if (!dataLoaded && loading) {
    return (
      <div className="staffetta-container">
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            Caricamento dati in corso...
            <div className="loading-subtext">Attendere prego...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!dataLoaded && error) {
    return (
      <div className="staffetta-container">
        <div className="error-container">
          <div className="error-message">
            <div className="error-title">Errore di caricamento</div>
            <div className="error-text">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="retry-button"
            >
              Riprova
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="staffetta-container">
      <div className="view-selector">
        <button
          className={`view-btn ${activeTab === "auto" ? "active" : ""}`}
          onClick={() => setActiveTab("auto")}
        >
          Configurazione Automatica
        </button>
        <button
          className={`view-btn ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          Configurazione Manuale
        </button>
        <button
          className={`view-btn ${activeTab === "formations" ? "active" : ""}`}
          onClick={() => setActiveTab("formations")}
        >
          Formazioni ({formations.length})
        </button>
        <button
          className={`view-btn ${activeTab === "ranking" ? "active" : ""}`}
          onClick={() => setActiveTab("ranking")}
        >
          Classifica Atleti
        </button>
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-error">
            ✕
          </button>
        </div>
      )}

      {activeTab === "auto" && (
        <div className="config-view">
          <div className="form-group">
            <label>Tipologia Atleti</label>
            <select
              value={settings.type}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  type: e.target.value,
                  categories: [],
                })
              }
              className="form-select"
            >
              <option value="">Seleziona tipologia</option>
              <option value="Propaganda">Propaganda</option>
              <option value="Agonista">Agonista</option>
            </select>
          </div>

          {settings.type && (
            <div className="form-group">
              <label>Categoria</label>
              <select
                multiple
                value={settings.categories}
                onChange={(e) => {
                  const selectedOptions = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  setSettings({ ...settings, categories: selectedOptions });
                }}
                className="form-select"
                size={Math.min(4, categories.length)}
                style={{ height: "auto" }}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="help-text">
                {settings.categories.length === 0
                  ? "Seleziona almeno una categoria"
                  : `Categorie selezionate: ${settings.categories.join(", ")}`}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Tipo Staffetta</label>
            <select
              value={settings.staffettaType}
              onChange={(e) =>
                setSettings({ ...settings, staffettaType: e.target.value })
              }
              className="form-select"
            >
              <option value="">Seleziona tipo staffetta</option>
              <option value="stilelibero">Stile Libero</option>
              <option value="mista">Mista</option>
            </select>
          </div>

          <div className="form-group">
            <label>Distanza</label>
            <select
              value={settings.distance}
              onChange={(e) =>
                setSettings({ ...settings, distance: e.target.value })
              }
              className="form-select"
            >
              <option value="">Seleziona distanza</option>
              {DISTANCES.map((d) => (
                <option key={d} value={d}>
                  {d}m
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Composizione</label>
            <select
              value={settings.compositionType}
              onChange={(e) => {
                const newType = e.target.value;
                setSettings({
                  ...settings,
                  compositionType: newType,
                  gender: newType === "mixed" ? "mixed" : settings.gender,
                });
              }}
              className="form-select"
            >
              <option value="">Seleziona composizione</option>
              <option value="single">4 Atleti stesso sesso</option>
              <option value="mixed">2 Maschi + 2 Femmine</option>
            </select>
          </div>

          {settings.compositionType === "single" && (
            <div className="form-group">
              <label>Genere</label>
              <select
                value={settings.gender}
                onChange={(e) =>
                  setSettings({ ...settings, gender: e.target.value })
                }
                className="form-select"
              >
                <option value="">Seleziona genere</option>
                <option value="M">Maschi</option>
                <option value="F">Femmine</option>
              </select>
            </div>
          )}

          <div className="formation-actions">
            <button
              onClick={handleCreateAutoFormation}
              disabled={loading}
              className="action-button create-button"
            >
              {loading ? "Calcolo in corso..." : "Calcola Migliore Formazione"}
            </button>
            {formations.length > 0 && (
              <button
                onClick={handleReset}
                className="action-button reset-button"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === "manual" && (
        <div className="config-view">
          <div className="form-group">
            <label>Tipologia Atleti</label>
            <select
              value={settings.type}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  type: e.target.value,
                  categories: [],
                })
              }
              className="form-select"
            >
              <option value="">Seleziona tipologia</option>
              <option value="Propaganda">Propaganda</option>
              <option value="Agonista">Agonista</option>
            </select>
          </div>

          {settings.type && (
            <div className="form-group">
              <label>Categoria</label>
              <select
                multiple
                value={settings.categories}
                onChange={(e) => {
                  const selectedOptions = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  setSettings({ ...settings, categories: selectedOptions });
                }}
                className="form-select"
                size={Math.min(4, categories.length)}
                style={{ height: "auto" }}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="help-text">
                {settings.categories.length === 0
                  ? "Seleziona almeno una categoria"
                  : `Categorie selezionate: ${settings.categories.join(", ")}`}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Tipo Staffetta</label>
            <select
              value={settings.staffettaType}
              onChange={(e) =>
                setSettings({ ...settings, staffettaType: e.target.value })
              }
              className="form-select"
            >
              <option value="">Seleziona tipo staffetta</option>
              <option value="stilelibero">Stile Libero</option>
              <option value="mista">Mista</option>
            </select>
          </div>

          <div className="form-group">
            <label>Distanza</label>
            <select
              value={settings.distance}
              onChange={(e) =>
                setSettings({ ...settings, distance: e.target.value })
              }
              className="form-select"
            >
              <option value="">Seleziona distanza</option>
              {DISTANCES.map((d) => (
                <option key={d} value={d}>
                  {d}m
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Composizione</label>
            <select
              value={settings.compositionType}
              onChange={(e) => {
                const newType = e.target.value;
                setSettings({
                  ...settings,
                  compositionType: newType,
                  gender: newType === "mixed" ? "mixed" : settings.gender,
                });
              }}
              className="form-select"
            >
              <option value="">Seleziona composizione</option>
              <option value="single">4 Atleti stesso sesso</option>
              <option value="mixed">2 Maschi + 2 Femmine</option>
            </select>
          </div>

          {settings.compositionType === "single" && (
            <div className="form-group">
              <label>Genere</label>
              <select
                value={settings.gender}
                onChange={(e) =>
                  setSettings({ ...settings, gender: e.target.value })
                }
                className="form-select"
              >
                <option value="">Seleziona genere</option>
                <option value="M">Maschi</option>
                <option value="F">Femmine</option>
              </select>
            </div>
          )}

          {settings.type &&
            settings.categories.length > 0 &&
            settings.staffettaType &&
            settings.distance && (
              <>
                <div className="fractionists-section">
                  <h3>Selezione Frazionisti</h3>

                  <div className="fractionist-row">
                    <div className="fractionist-label">
                      <span>Frazionista 1:</span>
                      <span className="style-name">
                        {getStyleForPosition(1)}
                      </span>
                    </div>
                    <select
                      value={manualFormation.athlete1}
                      onChange={(e) =>
                        setManualFormation({
                          ...manualFormation,
                          athlete1: e.target.value,
                        })
                      }
                      className="fractionist-select"
                    >
                      <option value="">Seleziona atleta</option>
                      {getEligibleFractionistAthletes(1).map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.lastName} {athlete.name} (
                          {athlete.gender === "Maschio" ? "M" : "F"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fractionist-row">
                    <div className="fractionist-label">
                      <span>Frazionista 2:</span>
                      <span className="style-name">
                        {getStyleForPosition(2)}
                      </span>
                    </div>
                    <select
                      value={manualFormation.athlete2}
                      onChange={(e) =>
                        setManualFormation({
                          ...manualFormation,
                          athlete2: e.target.value,
                        })
                      }
                      className="fractionist-select"
                    >
                      <option value="">Seleziona atleta</option>
                      {getEligibleFractionistAthletes(2).map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.lastName} {athlete.name} (
                          {athlete.gender === "Maschio" ? "M" : "F"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fractionist-row">
                    <div className="fractionist-label">
                      <span>Frazionista 3:</span>
                      <span className="style-name">
                        {getStyleForPosition(3)}
                      </span>
                    </div>
                    <select
                      value={manualFormation.athlete3}
                      onChange={(e) =>
                        setManualFormation({
                          ...manualFormation,
                          athlete3: e.target.value,
                        })
                      }
                      className="fractionist-select"
                    >
                      <option value="">Seleziona atleta</option>
                      {getEligibleFractionistAthletes(3).map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.lastName} {athlete.name} (
                          {athlete.gender === "Maschio" ? "M" : "F"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fractionist-row">
                    <div className="fractionist-label">
                      <span>Frazionista 4:</span>
                      <span className="style-name">
                        {getStyleForPosition(4)}
                      </span>
                    </div>
                    <select
                      value={manualFormation.athlete4}
                      onChange={(e) =>
                        setManualFormation({
                          ...manualFormation,
                          athlete4: e.target.value,
                        })
                      }
                      className="fractionist-select"
                    >
                      <option value="">Seleziona atleta</option>
                      {getEligibleFractionistAthletes(4).map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.lastName} {athlete.name} (
                          {athlete.gender === "Maschio" ? "M" : "F"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const previewData = calculatePreviewTimes();

                    if (!previewData) {
                      return (
                        <div className="preview-message">
                          Seleziona tutti i frazionisti per visualizzare
                          l'anteprima dei tempi
                        </div>
                      );
                    }

                    if (previewData.error) {
                      return (
                        <div className="preview-error">{previewData.error}</div>
                      );
                    }

                    return (
                      <div className="times-preview-container">
                        <h4>Anteprima Tempi</h4>
                        <table className="times-preview-table">
                          <thead>
                            <tr>
                              <th>Frazionista</th>
                              <th>Stile</th>
                              <th>Tempo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.formationTimes.map((entry, index) => (
                              <tr key={index}>
                                <td>
                                  {entry.athlete.lastName} {entry.athlete.name}
                                </td>
                                <td>{STYLES[entry.style]}</td>
                                <td className="time-cell">
                                  {formatTime(entry.formattedTime)}
                                </td>
                              </tr>
                            ))}
                            <tr className="total-row">
                              <td colSpan="2">Tempo Totale</td>
                              <td className="time-cell total-time">
                                {previewData.formattedTotalTime}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div className="formation-actions">
                  <button
                    onClick={handleCreateManualFormation}
                    disabled={
                      loading ||
                      !calculatePreviewTimes() ||
                      calculatePreviewTimes()?.error
                    }
                    className="action-button create-button"
                  >
                    {loading
                      ? "Generazione in corso..."
                      : "Inserisci Formazione"}
                  </button>
                  {formations.length > 0 && (
                    <button
                      onClick={handleReset}
                      className="action-button reset-button"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </>
            )}
        </div>
      )}

      {activeTab === "formations" && (
        <div className="formations-view">
          {formations.map((formation, index) => (
            <div key={index} className="formation-card">
              <div className="formation-header">
                <div>Formazione #{index + 1}</div>
                <div className="formation-actions">
                  <div className="total-time">
                    Tempo Totale: {formatTime(formation.formattedTotalTime)}
                  </div>
                  <button
                    onClick={() => handleRemoveFormation(index)}
                    className="remove-button"
                  >
                    Rimuovi
                  </button>
                </div>
              </div>

              <div className="formation-body">
                {formation.formation.map((position, pos) => (
                  <div key={pos} className="position-row">
                    <div className="athlete-info">
                      <div className="athlete-name">
                        {position.athlete.lastName} {position.athlete.name}
                        <span className="athlete-gender">
                          ({position.athlete.gender === "Maschio" ? "M" : "F"})
                        </span>
                      </div>
                      <div className="athlete-details">
                        {settings.staffettaType === "mista" && (
                          <span className="style-badge">
                            {STYLES[position.style]}
                          </span>
                        )}
                        <div className="time-date-container">
                          <span className="best-time">
                            {formatTime(position.bestTime)}
                          </span>
                          <span className="time-date">
                            {formatDate(position.bestTimeDate)}
                            <span className="time-type">({position.type})</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleOpenReplaceModal(index, pos, position.athlete.id)
                      }
                      className="replace-button"
                    >
                      Sostituisci
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {formations.length === 0 && (
            <div className="no-formations">
              Nessuna formazione generata. Usa la configurazione per creare
              nuove formazioni.
            </div>
          )}
        </div>
      )}

      {activeTab === "ranking" && (
        <div className="ranking-view">
          <div className="ranking-filters">
            <div className="form-group">
              <label>Stile</label>
              <select
                value={rankingFilters.style}
                onChange={(e) =>
                  setRankingFilters({
                    ...rankingFilters,
                    style: e.target.value,
                  })
                }
                className="form-select"
              >
                <option value="">Seleziona stile</option>
                <option value="stilelibero">Stile libero</option>
                <option value="dorso">Dorso</option>
                <option value="rana">Rana</option>
                <option value="farfalla">Farfalla</option>
              </select>
            </div>

            <div className="form-group">
              <label>Distanza</label>
              <select
                value={rankingFilters.distance}
                onChange={(e) =>
                  setRankingFilters({
                    ...rankingFilters,
                    distance: e.target.value,
                  })
                }
                className="form-select"
              >
                <option value="">Seleziona distanza</option>
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>
                    {d}m
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Tipologie</label>
              <select
                multiple
                value={rankingFilters.types}
                onChange={(e) => {
                  const selectedOptions = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  setRankingFilters({
                    ...rankingFilters,
                    types: selectedOptions,
                    categories: [],
                  });
                }}
                className="form-select"
                size={3}
                style={{ height: "auto" }}
              >
                <option value="Propaganda">Propaganda</option>
                <option value="Agonista">Agonista</option>
                <option value="Master">Master</option>
              </select>
              <div className="help-text">
                {rankingFilters.types.length === 0
                  ? "Lascia vuoto per tutte le tipologie o seleziona una o più tipologie"
                  : `Tipologie selezionate: ${rankingFilters.types.join(", ")}`}
              </div>
            </div>

            <div className="form-group">
              <label>Categorie</label>
              <select
                multiple
                value={rankingFilters.categories}
                onChange={(e) => {
                  const selectedOptions = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  setRankingFilters({
                    ...rankingFilters,
                    categories: selectedOptions,
                  });
                }}
                className="form-select"
                size={Math.min(6, availableRankingCategories.length)}
                style={{ height: "auto" }}
              >
                {availableRankingCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="help-text">
                {rankingFilters.categories.length === 0
                  ? "Lascia vuoto per tutte le categorie o seleziona una o più categorie"
                  : `Categorie selezionate: ${rankingFilters.categories.join(
                      ", "
                    )}`}
              </div>
            </div>
          </div>

          <div className="formation-actions" style={{ marginTop: "20px" }}>
            <button
              onClick={handleGenerateRanking}
              className="action-button create-button"
            >
              Genera Classifica
            </button>
          </div>

          {showRankingResults && (
            <div className="ranking-results">
              <h3 className="ranking-title">
                Classifica {STYLES[rankingFilters.style]}{" "}
                {rankingFilters.distance}m
                {rankingFilters.types.length > 0 &&
                  ` - ${rankingFilters.types.join(", ")}`}
                {rankingFilters.categories.length > 0 &&
                  ` - ${rankingFilters.categories.join(", ")}`}
              </h3>

              {rankingResults.length === 0 ? (
                <div className="no-rankings">
                  Nessun atleta trovato con tempi registrati per questa
                  combinazione.
                </div>
              ) : (
                <>
                  {/* Tabella per desktop */}
                  <table className="ranking-table ranking-table-desktop">
                    <thead>
                      <tr>
                        <th>Pos.</th>
                        <th>Atleta</th>
                        <th>Tipologia</th>
                        <th>Categoria</th>
                        <th>Sesso</th>
                        <th>Tempo</th>
                        <th>Data</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingResults.map((entry, index) => (
                        <tr key={entry.athlete.id}>
                          <td className="position-number">{index + 1}</td>
                          <td className="athlete-name-cell">
                            {entry.athlete.lastName} {entry.athlete.name}
                          </td>
                          <td>{entry.athlete.type}</td>
                          <td>{entry.athlete.category}</td>
                          <td className="gender-cell">
                            {entry.athlete.gender === "Maschio" ? "M" : "F"}
                          </td>
                          <td className="time-cell">
                            {formatTime(entry.timeData.timeFormatted)}
                          </td>
                          <td>{formatDate(entry.timeData.date)}</td>
                          <td className="type-cell">{entry.timeData.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Card per mobile */}
                  <div className="ranking-cards ranking-cards-mobile">
                    {rankingResults.map((entry, index) => (
                      <div key={entry.athlete.id} className="ranking-card">
                        <div className="ranking-card-header">
                          <div className="ranking-position">{index + 1}</div>
                          <div className="ranking-athlete-name">
                            {entry.athlete.lastName} {entry.athlete.name}
                          </div>
                          <div className="ranking-gender-badge">
                            {entry.athlete.gender === "Maschio" ? "M" : "F"}
                          </div>
                        </div>
                        <div className="ranking-card-time">
                          {formatTime(entry.timeData.timeFormatted)}
                        </div>
                        <div className="ranking-card-details">
                          <div className="ranking-detail-item">
                            <span className="detail-label">Tipologia:</span>
                            <span className="detail-value">
                              {entry.athlete.type}
                            </span>
                          </div>
                          <div className="ranking-detail-item">
                            <span className="detail-label">Categoria:</span>
                            <span className="detail-value">
                              {entry.athlete.category}
                            </span>
                          </div>
                          <div className="ranking-detail-item">
                            <span className="detail-label">Data:</span>
                            <span className="detail-value">
                              {formatDate(entry.timeData.date)}
                            </span>
                          </div>
                          <div className="ranking-detail-item">
                            <span className="detail-label">Tipo:</span>
                            <span className="detail-value">
                              {entry.timeData.type}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {replacementModal.isOpen && (
        <div
          className="modal-overlay"
          onClick={() => setReplacementModal({ isOpen: false })}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Seleziona Sostituto</h3>
            <div className="athletes-list">
              {getReplacementCandidates().map((athlete) => (
                <button
                  key={athlete.id}
                  onClick={() => handleReplaceAthlete(athlete.id)}
                  className="athlete-option"
                >
                  <span>
                    {athlete.lastName} {athlete.name}
                    <span className="athlete-category">
                      ({athlete.category})
                    </span>
                  </span>
                  <span className="athlete-gender-badge">
                    {athlete.gender === "Maschio" ? "M" : "F"}
                  </span>
                </button>
              ))}
              {getReplacementCandidates().length === 0 && (
                <div className="no-candidates">
                  Nessun atleta disponibile per la sostituzione con i criteri
                  attuali.
                </div>
              )}
            </div>
            <button
              onClick={() => setReplacementModal({ isOpen: false })}
              className="close-modal"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            {activeTab === "auto"
              ? "Calcolo in corso..."
              : activeTab === "manual"
              ? "Generazione in corso..."
              : "Caricamento..."}
          </div>
        </div>
      )}
    </div>
  );
}
