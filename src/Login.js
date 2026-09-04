import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [credentials, setCredentials] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Autenticazione con Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        credentials.email,
        credentials.password
      );

      // Verifica utente in Firestore
      const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Verifica l'atleta associato
        const athletesRef = collection(db, "athletes");
        const athletesSnapshot = await getDocs(athletesRef);
        const athleteExists = athletesSnapshot.docs.some((doc) => {
          const athleteData = doc.data();
          return (
            athleteData.name.toLowerCase() ===
              userData.childName.toLowerCase() &&
            athleteData.lastName.toLowerCase() ===
              userData.childLastName.toLowerCase()
          );
        });

        if (athleteExists) {
          // Salva i dati nel localStorage
          localStorage.setItem("auth_token", userCredential.user.uid);
          localStorage.setItem("user_role", userData.role);
          localStorage.setItem("user_name", userData.name);
          localStorage.setItem("userEmail", userData.email);
          window.location.href = "/";
        } else {
          throw new Error("Nessun atleta trovato con questi dati");
        }
      } else {
        throw new Error("Utente non trovato nel database");
      }
    } catch (error) {
      console.error("Errore durante il login:", error);
      setError(error.message);
      setCredentials({ ...credentials, password: "" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {isResettingPassword ? "Reimposta Password" : "Accedi al tuo account"}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Non hai un account?{" "}
          <Link
            to="/create-user"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Registrati come genitore
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!isResettingPassword ? (
            // Form di Login
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={credentials.email}
                    onChange={(e) =>
                      setCredentials({ ...credentials, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        password: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="calendar-navigation">
                <button
                  type="button"
                  onClick={() => setIsResettingPassword(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Password dimenticata?
                </button>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center">{error}</div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                    isLoading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {isLoading ? "Accesso in corso..." : "Accedi"}
                </button>
              </div>
            </form>
          ) : (
            // Form Reset Password
            <form className="space-y-6" onSubmit={handlePasswordReset}>
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Inserisci la tua email
                </label>
                <div className="mt-1">
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={credentials.email}
                    onChange={(e) =>
                      setCredentials({ ...credentials, email: e.target.value })
                    }
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center">{error}</div>
              )}

              {successMessage && (
                <div className="text-green-600 text-sm text-center">
                  {successMessage}
                </div>
              )}

              <div className="flex flex-col space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                    isLoading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {isLoading
                    ? "Invio in corso..."
                    : "Invia email di reset password"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsResettingPassword(false);
                    setError("");
                    setSuccessMessage("");
                  }}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Torna al login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
