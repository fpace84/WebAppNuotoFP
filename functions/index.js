const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.deleteUserFromAuth = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    return new Promise((resolve, reject) => {
      cors(data, context, async () => {
        try {
          // Verifica che l'utente che fa la richiesta sia admin
          if (!context.auth) {
            throw new functions.https.HttpsError(
              "unauthenticated",
              "Devi essere autenticato"
            );
          }

          const callerUid = context.auth.uid;
          const callerDoc = await admin
            .firestore()
            .collection("users")
            .doc(callerUid)
            .get();

          if (!callerDoc.exists || callerDoc.data().role !== "admin") {
            throw new functions.https.HttpsError(
              "permission-denied",
              "Solo gli admin possono eliminare gli utenti"
            );
          }

          // Elimina l'utente da Authentication
          await admin.auth().deleteUser(data.uid);
          resolve({ success: true });
        } catch (error) {
          console.error("Error:", error);
          reject(new functions.https.HttpsError("internal", error.message));
        }
      });
    });
  });
