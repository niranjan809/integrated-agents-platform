import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { isRunningStatus } from "./status";

export function useCompanies() {
  const [companies, setCompanies] = useState([]);
  const [strategiesByCompany, setStrategiesByCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const pollRef = useRef();

  const refresh = useCallback(async () => {
    const list = await api.listCompanies();
    setCompanies(list);

    const entries = await Promise.all(
      list.map(async (c) => [c.id, await api.getStrategies(c.id).catch(() => [])])
    );
    setStrategiesByCompany(Object.fromEntries(entries));
    setLoading(false);

    clearTimeout(pollRef.current);
    if (list.some((c) => isRunningStatus(c.status) || c.status === "pending")) {
      pollRef.current = setTimeout(refresh, 3000);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => clearTimeout(pollRef.current);
  }, [refresh]);

  return { companies, strategiesByCompany, loading, refresh };
}
