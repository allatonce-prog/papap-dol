// ============================================================
//  PAPAP DOL — Firebase Configuration
// ============================================================
//  Replace ALL placeholder values below with your own Firebase
//  project credentials.
//
//  How to get them:
//  1. Go to https://console.firebase.google.com
//  2. Create a new project (or open an existing one)
//  3. Enable "Realtime Database" (Build → Realtime Database → Create)
//     - Choose a region (e.g. us-central1)
//     - Start in TEST MODE for development (open rules)
//  4. Go to Project Settings → Your apps → Add app → Web (</>)
//  5. Copy the firebaseConfig object values below
//
//  Recommended Realtime Database Security Rules (for development):
//  {
//    "rules": {
//      ".read": true,
//      ".write": true
//    }
//  }
//
//  Firebase indexes required (add to "rules" → "indexes"):
//  rooms → index on: status
// ============================================================

export const firebaseConfig = {
  apiKey:            "AIzaSyCCvi3rUMR6B_ejEIXSk7OSnSrhamlFrqk",
  authDomain:        "papap-dol-b5a41.firebaseapp.com",
  databaseURL:       "https://papap-dol-b5a41-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "papap-dol-b5a41",
  storageBucket:     "papap-dol-b5a41.firebasestorage.app",
  messagingSenderId: "792017221636",
  appId:             "1:792017221636:web:5d981094f9c5dd740e5d51",
  measurementId:     "G-838Z9KZ412",
};
