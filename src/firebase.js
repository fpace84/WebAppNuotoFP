import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyATeaoS5urnpSk-zpxE5gOt2PWqVHD-m2M",
  authDomain: "webapp-nuoto.firebaseapp.com",
  projectId: "webapp-nuoto",
  storageBucket: "webapp-nuoto.appspot.com",
  messagingSenderId: "1048171213284",
  appId: "1:1048171213284:web:0804dbfd85a6f643f017f1",
};

// Prima inizializza l'app
const app = initializeApp(firebaseConfig);

// Poi inizializza i servizi
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west1");

// Esporta tutto
export { db, auth, functions };
