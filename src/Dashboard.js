import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("user");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("user_role") || "user";
      setUserRole(role);
    }
  }, []);

  const buttons = [
    {
      id: "newAthlete",
      label: "Aggiungi Nuovo Atleta",
      path: "/new-athlete",
      color: "#4F46E5",
      roles: ["admin", "coach"],
    },
    {
      id: "trainingTimes",
      label: "Registra Tempi Allenamento",
      path: "/training-times",
      color: "#059669",
      roles: ["admin", "coach"],
    },
    {
      id: "competitionResults",
      label: "Registra Tempi Gara",
      path: "/competition-results",
      color: "#7C3AED",
      roles: ["admin", "coach"],
    },
    {
      id: "athletes",
      label: "Gestione Atleti",
      path: "/athletes",
      color: "#2563EB",
      roles: ["admin", "coach", "user"],
    },
    {
      id: "competitions",
      label: "Competizioni",
      path: "/competitions",
      color: "#DB2777",
      roles: ["admin", "coach", "user"],
    },
    {
      id: "reports",
      label: "Report",
      path: "/reports",
      color: "#0D9488",
      roles: ["admin", "coach"],
    },
    {
      id: "attendance",
      label: "Gestione Presenze",
      path: "/attendance",
      color: "#F97316",
      roles: ["admin", "coach"],
    },
    {
      id: "staffetta",
      label: "Gestione Staffette",
      path: "/staffetta",
      color: "#8B5CF6",
      roles: ["admin", "coach"],
    },
    {
      id: "statistics",
      label: "Statistiche",
      path: "/statistics",
      color: "#0891B2",
      roles: ["admin", "coach", "user"],
    },
    {
      id: "records",
      label: "Record per Categoria",
      path: "/records",
      color: "#CA8A04",
      roles: ["admin", "coach", "user"],
    },
  ];

  return (
    <div className="dashboard-container">
      <div className="grid">
        {buttons
          .filter((button) => button.roles.includes(userRole))
          .map((button) => (
            <button
              key={button.id}
              onClick={() => navigate(button.path)}
              style={{ backgroundColor: button.color }}
              className="dashboard-button"
            >
              {button.label}
            </button>
          ))}
      </div>
    </div>
  );
}
