
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyATGt3vz9SxGSLnO-XkhM1QOtisRvDLsys",
  authDomain: "campusfit-sch.firebaseapp.com",
  projectId: "campusfit-sch",
  storageBucket: "campusfit-sch.firebasestorage.app",
  messagingSenderId: "1023293448776",
  appId: "1:1023293448776:web:7926a8bbf0e80b60462e7d",
  measurementId: "G-Q6ME41ZN7L",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
