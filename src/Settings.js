import React, { useState, useEffect } from "react";
import { auth, db, functions } from "./firebase";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import "./settings.css";

export default function Settings() {
  const [view, setView] = useState("list"); // "list", "create" o "edit"
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "coach",
    childName: "",
    childLastName: "",
  });

  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({
    name: "",
    role: "",
    childName: "",
    childLastName: "",
  });

  const loadUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersData = usersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(usersData);
    } catch (err) {
      console.error("Errore nel caricamento degli utenti:", err);
      setError("Errore nel caricamento degli utenti");
      setSuccessMessage("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    if (
      newUser.role === "user" &&
      (!newUser.childName || !newUser.childLastName)
    ) {
      setError("Per i genitori, nome e cognome del figlio sono obbligatori");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newUser.email,
        newUser.password
      );

      try {
        const userData = {
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          createdAt: new Date(),
        };

        if (newUser.role === "user") {
          userData.childName = newUser.childName;
          userData.childLastName = newUser.childLastName;
        }

        await setDoc(doc(db, "users", userCredential.user.uid), userData);

        setNewUser({
          email: "",
          password: "",
          name: "",
          role: "coach",
          childName: "",
          childLastName: "",
        });
        setView("list");
        await loadUsers();
        setSuccessMessage("Utente creato con successo!");
      } catch (firestoreError) {
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
      setSuccessMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditUserData({
      name: user.name || "",
      role: user.role || "coach",
      childName: user.childName || "",
      childLastName: user.childLastName || "",
    });
    setView("edit");
    setError("");
    setSuccessMessage("");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      if (
        editUserData.role === "user" &&
        (!editUserData.childName || !editUserData.childLastName)
      ) {
        setError("Per i genitori, nome e cognome del figlio sono obbligatori");
        setLoading(false);
        return;
      }

      const userData = {
        name: editUserData.name,
        role: editUserData.role,
      };

      if (editUserData.role === "user") {
        userData.childName = editUserData.childName;
        userData.childLastName = editUserData.childLastName;
      } else {
        const userDoc = await getDoc(doc(db, "users", editingUser.id));
        if (userDoc.exists() && userDoc.data().role === "user") {
          userData.childName = null;
          userData.childLastName = null;
        }
      }

      await updateDoc(doc(db, "users", editingUser.id), userData);

      await loadUsers();

      setEditingUser(null);
      setView("list");
      setSuccessMessage("Utente aggiornato con successo!");
    } catch (error) {
      console.error("Errore durante l'aggiornamento:", error);
      setError("Errore durante l'aggiornamento dell'utente");
      setSuccessMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (window.confirm("Sei sicuro di voler eliminare questo utente?")) {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      try {
        await deleteDoc(doc(db, "users", userId));

        const deleteUserFromAuth = httpsCallable(
          functions,
          "deleteUserFromAuth"
        );
        await deleteUserFromAuth({ uid: userId });

        await loadUsers();
        setSuccessMessage("Utente eliminato con successo");
      } catch (error) {
        console.error("Errore nell'eliminazione:", error);
        setError("Errore durante l'eliminazione dell'utente");
        setSuccessMessage("");
      } finally {
        setLoading(false);
      }
    }
  };

  const getRoleDisplay = (role) => {
    switch (role) {
      case "admin":
        return "Amministratore";
      case "coach":
        return "Allenatore";
      case "user":
        return "Genitore";
      default:
        return role;
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="settings-loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Rendering per dispositivi mobili
  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">
          {view === "list"
            ? "Gestione Utenti"
            : view === "create"
            ? "Crea Nuovo Utente"
            : "Modifica Utente"}
        </h1>
        {view === "list" ? (
          <button
            className="button-primary"
            onClick={() => {
              setView("create");
              setError("");
              setSuccessMessage("");
            }}
          >
            Crea Nuovo Utente
          </button>
        ) : (
          <button
            className="button-secondary"
            onClick={() => {
              setView("list");
              setEditingUser(null);
              setError("");
              setSuccessMessage("");
            }}
          >
            Torna alla Lista
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && (
        <div className="success-message">{successMessage}</div>
      )}

      {view === "create" && (
        <div className="create-user-form">
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                required
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                required
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Nome Completo</label>
              <input
                type="text"
                required
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Ruolo</label>
              <select
                required
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value })
                }
              >
                <option value="admin">Amministratore</option>
                <option value="coach">Allenatore</option>
                <option value="user">Genitore</option>
              </select>
            </div>

            {newUser.role === "user" && (
              <>
                <div className="form-group">
                  <label>Nome del Figlio/a</label>
                  <input
                    type="text"
                    required
                    value={newUser.childName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, childName: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Cognome del Figlio/a</label>
                  <input
                    type="text"
                    required
                    value={newUser.childLastName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, childLastName: e.target.value })
                    }
                  />
                </div>
              </>
            )}

            <button type="submit" className="button-submit" disabled={loading}>
              {loading ? "Creazione in corso..." : "Crea Utente"}
            </button>
          </form>
        </div>
      )}

      {view === "edit" && editingUser && (
        <div className="edit-user-form">
          <form onSubmit={handleSaveEdit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editingUser.email}
                disabled
                className="disabled-input"
              />
              <p className="form-help-text">
                L'email non può essere modificata
              </p>
            </div>

            <div className="form-group">
              <label>Nome Completo</label>
              <input
                type="text"
                required
                value={editUserData.name}
                onChange={(e) =>
                  setEditUserData({ ...editUserData, name: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Ruolo</label>
              <select
                required
                value={editUserData.role}
                onChange={(e) =>
                  setEditUserData({ ...editUserData, role: e.target.value })
                }
              >
                <option value="admin">Amministratore</option>
                <option value="coach">Allenatore</option>
                <option value="user">Genitore</option>
              </select>
            </div>

            {editUserData.role === "user" && (
              <>
                <div className="form-group">
                  <label>Nome del Figlio/a</label>
                  <input
                    type="text"
                    required
                    value={editUserData.childName}
                    onChange={(e) =>
                      setEditUserData({
                        ...editUserData,
                        childName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Cognome del Figlio/a</label>
                  <input
                    type="text"
                    required
                    value={editUserData.childLastName}
                    onChange={(e) =>
                      setEditUserData({
                        ...editUserData,
                        childLastName: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}

            <button type="submit" className="button-submit" disabled={loading}>
              {loading ? "Aggiornamento in corso..." : "Salva Modifiche"}
            </button>
          </form>
        </div>
      )}

      {view === "list" && (
        <div className="users-list">
          {/* Per device mobili, visualizziamo card invece di tabella */}
          <div className="users-mobile-list">
            {users.map((user) => (
              <div key={user.id} className="user-card">
                <div className="user-card-header">
                  <h3 className="user-name">{user.name}</h3>
                  <span className="user-role">{getRoleDisplay(user.role)}</span>
                </div>
                <div className="user-card-body">
                  <p className="user-email">
                    <strong>Email:</strong> {user.email}
                  </p>
                  {user.role === "user" && (
                    <p className="user-child">
                      <strong>Figlio/a:</strong> {user.childName}{" "}
                      {user.childLastName}
                    </p>
                  )}
                </div>
                <div className="user-card-actions">
                  <button
                    onClick={() => handleEditUser(user)}
                    className="button-edit"
                    disabled={loading}
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.email)}
                    className="button-delete"
                    disabled={loading}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Tabella per schermi più grandi (nascosta su mobile) */}
          <table className="users-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Figlio/a</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{getRoleDisplay(user.role)}</td>
                  <td>
                    {user.role === "user"
                      ? `${user.childName} ${user.childLastName}`
                      : "-"}
                  </td>
                  <td className="actions-cell">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="button-edit"
                      disabled={loading}
                    >
                      Modifica
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id, user.email)}
                      className="button-delete"
                      disabled={loading}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
