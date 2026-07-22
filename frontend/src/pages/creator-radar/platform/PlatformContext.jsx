import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";

// Selected platform ('instagram' | 'tiktok'), persisted to sessionStorage so a refresh
// keeps it. api.js reads the same key directly (it's not a React component).
const KEY = "cr_selected_platform";
const PlatformContext = createContext(null);

export function PlatformProvider({ children }) {
  const { user } = useAuth(); // PlatformProvider is nested inside AuthProvider
  const [platform, setPlatformState] = useState(() => sessionStorage.getItem(KEY) || "instagram");

  function setPlatform(p) {
    sessionStorage.setItem(KEY, p);
    setPlatformState(p);
  }

  // When logged out, re-sync from sessionStorage. logout() clears the key, so this resets
  // the selection to the default; a plain refresh (key intact) preserves it.
  useEffect(() => {
    if (!user) setPlatformState(sessionStorage.getItem(KEY) || "instagram");
  }, [user]);

  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  return useContext(PlatformContext);
}
