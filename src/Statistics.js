import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { calculateCategory } from "./categories";
import "./dashboard.css";
import "./statistics.css";

export default function Statistics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!db) {
          throw new Error("Errore di connessione al database");
        }

        const [
          athletesSnapshot,
          racesSnapshot,
          resultsSnapshot,
          attendanceSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, "athletes")),
          getDocs(collection(db, "races")),
          getDocs(collection(db, "competitions")),
          getDocs(collection(db, "attendance")),
        ]);

        const allAthletes = athletesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const activeAthletes = allAthletes.filter((a) => !a.archived);
        const archivedCount = allAthletes.length - activeAthletes.length;

        // Atleti per tipologia
        const byType = { Agonista: 0, Propaganda: 0, Master: 0 };
        activeAthletes.forEach((a) => {
          if (byType[a.type] !== undefined) byType[a.type]++;
        });

        // Atleti per sesso
        const byGender = { Maschio: 0, Femmina: 0 };
        activeAthletes.forEach((a) => {
          if (byGender[a.gender] !== undefined) byGender[a.gender]++;
        });

        // Atleti per categoria (calcolata al volo)
        const byCategory = new Map();
        activeAthletes.forEach((a) => {
          const category = calculateCategory(a.birthYear, a.type, a.gender);
          if (!category) return;
          const key = `${a.type}|${category}`;
          byCategory.set(key, (byCategory.get(key) || 0) + 1);
        });
        const categoryRows = [...byCategory.entries()]
          .map(([key, count]) => {
            const [type, category] = key.split("|");
            return { type, category, count };
          })
          .sort((a, b) =>
            a.type === b.type
              ? a.category.localeCompare(b.category)
              : a.type.localeCompare(b.type)
          );

        // Competizioni e risultati
        const results = resultsSnapshot.docs.map((doc) => doc.data());
        const distinctAthletesRaced = new Set(
          results.map((r) => r.athleteId)
        ).size;

        // Presenze
        const attendanceRecords = attendanceSnapshot.docs.map((doc) =>
          doc.data()
        );
        const attendanceByStatus = {
          Presente: 0,
          Assente: 0,
          "Assente Giustificato": 0,
          Ritardo: 0,
          "Uscita Anticipata": 0,
        };
        attendanceRecords.forEach((r) => {
          if (attendanceByStatus[r.present] !== undefined) {
            attendanceByStatus[r.present]++;
          }
        });
        const trainingAttendance = attendanceRecords.filter(
          (r) => r.type === "allenamento"
        ).length;
        const raceAttendance = attendanceRecords.filter(
          (r) => r.type === "gara"
        ).length;

        setStats({
          totalAthletes: activeAthletes.length,
          archivedCount,
          byType,
          byGender,
          categoryRows,
          totalRaces: racesSnapshot.size,
          totalResults: results.length,
          distinctAthletesRaced,
          totalAttendance: attendanceRecords.length,
          attendanceByStatus,
          trainingAttendance,
          raceAttendance,
        });
      } catch (err) {
        console.error("Errore nel caricamento delle statistiche:", err);
        setError("Errore nel caricamento delle statistiche");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-4 text-red-600">{error}</div>;
  }

  const attendancePercent = (count) =>
    stats.totalAttendance > 0
      ? `${Math.round((count / stats.totalAttendance) * 100)}%`
      : "0%";

  return (
    <div className="dashboard-container">
      <section className="stats-section">
        <h2 className="stats-title">Atleti</h2>
        <div className="stats-container">
          <div className="stats-card">
            <h3>Iscritti</h3>
            <p className="stats-value">Totale: {stats.totalAthletes}</p>
            <p>Agonisti: {stats.byType.Agonista}</p>
            <p>Propaganda: {stats.byType.Propaganda}</p>
            <p>Master: {stats.byType.Master}</p>
            {stats.archivedCount > 0 && (
              <p className="stats-muted">
                Archiviati: {stats.archivedCount} (non conteggiati sopra)
              </p>
            )}
          </div>
          <div className="stats-card">
            <h3>Per Sesso</h3>
            <p>Maschi: {stats.byGender.Maschio}</p>
            <p>Femmine: {stats.byGender.Femmina}</p>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-title">Atleti per Categoria</h2>
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Tipologia</th>
                <th>Categoria</th>
                <th>Atleti</th>
              </tr>
            </thead>
            <tbody>
              {stats.categoryRows.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center py-4">
                    Nessun dato disponibile
                  </td>
                </tr>
              ) : (
                stats.categoryRows.map((row) => (
                  <tr key={`${row.type}-${row.category}`}>
                    <td>{row.type}</td>
                    <td>{row.category}</td>
                    <td>{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-title">Competizioni</h2>
        <div className="stats-container">
          <div className="stats-card">
            <h3>Gare</h3>
            <p>Totale Gare: {stats.totalRaces}</p>
            <p>Risultati Registrati: {stats.totalResults}</p>
            <p>Atleti che hanno gareggiato: {stats.distinctAthletesRaced}</p>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-title">Presenze</h2>
        <div className="stats-container">
          <div className="stats-card">
            <h3>Registrazioni</h3>
            <p className="stats-value">Totale: {stats.totalAttendance}</p>
            <p>Allenamenti: {stats.trainingAttendance}</p>
            <p>Gare: {stats.raceAttendance}</p>
          </div>
          <div className="stats-card">
            <h3>Per Stato</h3>
            {Object.entries(stats.attendanceByStatus).map(
              ([status, count]) => (
                <p key={status}>
                  {status}: {count} ({attendancePercent(count)})
                </p>
              )
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
