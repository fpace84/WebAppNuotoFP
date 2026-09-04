import "./app.css";
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  Link,
} from "react-router-dom";
import { UserCircle } from "lucide-react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import AthleteList from "./AthleteList";
import AthleteDetails from "./AthleteDetails";
import NewAthlete from "./NewAthlete";
import ClothingManagement from "./ClothingManagement";
import Settings from "./Settings";
import TrainingTimes from "./TrainingTimes";
import CompetitionResults from "./CompetitionResults";
import Competitions from "./Competitions";
import Reports from "./Reports";
import NewCompetition from "./NewCompetition";
import CreateUser from "./CreateUser";
import AttendanceManagement from "./AttendanceManagement";
import StaffettaManagement from "./StaffettaManagement";
import MigrateRecords from "./MigrateRecords";

const isAuthenticated = () => {
  const token = localStorage.getItem("auth_token");
  const userRole = localStorage.getItem("user_role");
  return token !== null && userRole !== null;
};

const hasRequiredRole = (requiredRoles) => {
  const userRole = localStorage.getItem("user_role");
  return requiredRoles.includes(userRole);
};

function Unauthorized() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <h2 className="text-center text-2xl font-bold text-red-600 mb-4">
            Accesso non autorizzato
          </h2>
          <p className="text-center text-gray-600 mb-4">
            Non hai i permessi necessari per accedere a questa pagina.
          </p>
          <div className="text-center">
            <Link
              to="/dashboard"
              className="text-indigo-600 hover:text-indigo-500"
            >
              Torna alla Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivateRoute({
  children,
  requiredRoles = ["admin", "coach", "user"],
}) {
  if (!isAuthenticated()) return <Navigate to="/login" />;
  if (!hasRequiredRole(requiredRoles)) return <Unauthorized />;
  return children;
}

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const userRole = localStorage.getItem("user_role");
  const isAdmin = userRole === "admin";

  useEffect(() => {
    const checkAuth = () => {
      setIsAuth(isAuthenticated());
    };

    window.addEventListener("storage", checkAuth);
    return () => window.removeEventListener("storage", checkAuth);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setIsAuth(false);
    setIsOpen(false);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {isAuth ? (
        <>
          <header className="header">
            <div className="header-grid">
              <div className="logo-container">
                <Link to="/dashboard">
                  <img src="/inuoto2.png" alt="iNuoto2 Logo" className="logo" />
                </Link>
              </div>

              <div className="title-container">
                <span className="app-title">iNuoto</span>
              </div>

              <div className="user-menu">
                <div className="user-dropdown">
                  {isOpen && isAdmin && (
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        window.location.href = "/settings";
                      }}
                      className="button-lime"
                    >
                      Impostazioni
                    </button>
                  )}
                  {isOpen && (
                    <button onClick={handleLogout} className="button-orange">
                      Logout
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(!isOpen)}
                  className="user-button"
                >
                  <UserCircle />
                </button>
              </div>
            </div>
          </header>

          <main className="main-container">
            <Routes>
              <Route path="/unauthorized" element={<Unauthorized />} />

              <Route
                path="/attendance"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <AttendanceManagement />
                  </PrivateRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach", "user"]}>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/athletes"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach", "user"]}>
                    <AthleteList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/athlete/:id"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach", "user"]}>
                    <AthleteDetails />
                  </PrivateRoute>
                }
              />
              <Route
                path="/new-athlete"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <NewAthlete />
                  </PrivateRoute>
                }
              />
              <Route
                path="/clothing/:id"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <ClothingManagement />
                  </PrivateRoute>
                }
              />
              <Route
                path="/new-competition"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <NewCompetition />
                  </PrivateRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <PrivateRoute requiredRoles={["admin"]}>
                    <Settings />
                  </PrivateRoute>
                }
              />
              <Route
                path="/create-user"
                element={
                  <PrivateRoute requiredRoles={["admin"]}>
                    <CreateUser />
                  </PrivateRoute>
                }
              />
              <Route
                path="/training-times"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <TrainingTimes />
                  </PrivateRoute>
                }
              />
              <Route
                path="/competition-results"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <CompetitionResults />
                  </PrivateRoute>
                }
              />
              <Route
                path="/competitions"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach", "user"]}>
                    <Competitions />
                  </PrivateRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <Reports />
                  </PrivateRoute>
                }
              />
              <Route
                path="/staffetta"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <StaffettaManagement />
                  </PrivateRoute>
                }
              />
              <Route
                path="/migrate-records"
                element={
                  <PrivateRoute requiredRoles={["admin", "coach"]}>
                    <MigrateRecords />
                  </PrivateRoute>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="*"
                element={
                  <div className="text-center mt-10">
                    404 - Pagina non trovata
                  </div>
                }
              />
            </Routes>
          </main>
        </>
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/create-user" element={<CreateUser />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
          <Route path="/migrate-records" element={<MigrateRecords />} />
        </Routes>
      )}
    </div>
  );
}

export default App;
