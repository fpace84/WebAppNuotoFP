import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function CreateUser() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userData, setUserData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [children, setChildren] = useState([{ childName: "", childLastName: "" }]);

  // Funzione di validazione per controllare nomi e cognomi
  const validateNameFormat = (name, fieldName) => {
    // Verifica se è vuoto
    if (!name) {
      return `Il campo ${fieldName} è obbligatorio`;
    }

    // Verifica spazi iniziali e finali
    if (name !== name.trim()) {
      return `Il ${fieldName} non deve contenere spazi all'inizio o alla fine`;
    }

    // Verifica caratteri validi (lettere, spazi interni, apostrofi e trattini)
    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]+([ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
    if (!nameRegex.test(name)) {
      return `Il ${fieldName} contiene caratteri non validi o spazi multipli consecutivi`;
    }

    return null; // Validazione superata
  };

  const handleAddChild = () => {
    setChildren([...children, { childName: "", childLastName: "" }]);
  };

  const handleRemoveChild = (index) => {
    setChildren(children.filter((_, i) => i !== index));
  };

  const handleChildChange = (index, field, value) => {
    setChildren(
      children.map((child, i) =>
        i === index ? { ...child, [field]: value } : child
      )
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Validazione password
      if (userData.password !== userData.confirmPassword) {
        throw new Error("Le password non corrispondono");
      }

      // Validazione nome e cognome di ogni figlio
      for (const child of children) {
        const nameError = validateNameFormat(child.childName, "nome del figlio");
        if (nameError) {
          throw new Error(nameError);
        }

        const lastNameError = validateNameFormat(
          child.childLastName,
          "cognome del figlio"
        );
        if (lastNameError) {
          throw new Error(lastNameError);
        }
      }

      // Normalizza i campi (trim per rimuovere eventuali spazi)
      const normalizedChildren = children.map((child) => ({
        childName: child.childName.trim(),
        childLastName: child.childLastName.trim(),
      }));

      // Crea utente in Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        userData.email,
        userData.password
      );

      try {
        // Crea documento in Firestore
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: userData.email,
          name: userData.name,
          role: "user",
          children: normalizedChildren,
          createdAt: new Date(),
        });

        alert("Utente creato con successo!");
        navigate("/login");
      } catch (firestoreError) {
        // Se fallisce la creazione in Firestore, elimina l'utente da Authentication
        console.error("Errore Firestore:", firestoreError);
        await deleteUser(userCredential.user);
        throw new Error("Errore nella creazione del profilo utente");
      }
    } catch (error) {
      console.error("Errore:", error);
      let errorMessage = "";
      switch (error.code) {
        case "auth/email-already-in-use":
          errorMessage = "Questa email è già registrata";
          break;
        case "auth/invalid-email":
          errorMessage = "Email non valida";
          break;
        case "auth/weak-password":
          errorMessage = "La password deve essere di almeno 6 caratteri";
          break;
        default:
          errorMessage = error.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Gestione del cambio di input con validazione immediata
  const handleInputChange = (field, value) => {
    setUserData({ ...userData, [field]: value });

    // Reset errore password
    if (
      (field === "password" || field === "confirmPassword") &&
      userData.password &&
      userData.confirmPassword &&
      error === "Le password non corrispondono"
    ) {
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Registrazione Nuovo Utente
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Hai già un account?{" "}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Accedi
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                required
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={userData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={userData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Conferma Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={userData.confirmPassword}
                onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nome Completo
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={userData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Figli/e
                </label>
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  + Aggiungi un altro figlio
                </button>
              </div>

              {children.map((child, index) => (
                <div
                  key={index}
                  className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      Figlio/a {index + 1}
                    </span>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChild(index)}
                        className="text-xs text-red-600 hover:text-red-500"
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>

                  <label className="block text-xs font-medium text-gray-700">
                    Nome
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 mb-2 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    value={child.childName}
                    onChange={(e) =>
                      handleChildChange(index, "childName", e.target.value)
                    }
                  />

                  <label className="block text-xs font-medium text-gray-700">
                    Cognome
                  </label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    value={child.childLastName}
                    onChange={(e) =>
                      handleChildChange(index, "childLastName", e.target.value)
                    }
                  />
                </div>
              ))}
              <p className="text-xs text-gray-500">
                Inserisci nome e cognome esatti dell'atleta (senza spazi aggiuntivi)
              </p>
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded animate-pulse">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? "Registrazione in corso..." : "Registrati"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
