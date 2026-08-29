import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // 1. Storage 서비스 임포트

// 1. Firebase 설정값
const firebaseConfig = {
  apiKey: "AIzaSyCAnulyCPKBDPBKF1N_Achau2HVNJBOmjI",
  authDomain: "stayonsbplatform.firebaseapp.com",
  projectId: "stayonsbplatform",
  storageBucket: "stayonsbplatform.firebasestorage.app",
  messagingSenderId: "604749074375",
  appId: "1:604749074375:web:45084d4b1255a6507f53e2",
  measurementId: "G-XX8M7HWSHP"
};

// 2. Firebase 초기화 (app이 먼저 만들어져야 함)
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);

// 3. 서비스 객체 내보내기 (SignUp.tsx에서 쓸 수 있게 export 추가)
export const auth = getAuth(app); 
export const db = getFirestore(app);
export const storage = getStorage(app); // 2. Storage 객체 생성 및 내보내기 추가