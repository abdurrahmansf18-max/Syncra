"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MyReportsResponse, Report } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "submitted", label: "Ettigim Sikayetler" },
  { key: "received", label: "Hakkimdaki Sikayetler" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function StatusBadge({ status }: { status: Report["status"] }) {
  return (
    <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {status}
    </span>
  );
}

export function MyReports() {
  const [activeTab, setActiveTab] = useState<TabKey>("submitted");
  const [data, setData] = useState<MyReportsResponse>({ submitted: [], received: [] });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMyReports = () => {
    setLoading(true);
    api
      .get<MyReportsResponse>("/reports/my")
      .then((res) => setData(res))
      .catch(() => setData({ submitted: [], received: [] }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMyReports();
    const timer = setInterval(fetchMyReports, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleDelete = async (reportId: string) => {
    if (deletingId) return;
    setDeletingId(reportId);
    try {
      await api.delete(`/reports/${reportId}/my`);
      fetchMyReports();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const list = activeTab === "submitted" ? data.submitted : data.received;

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-3 text-base font-semibold text-foreground">Sikayetlerim</h2>

      <div className="mb-4 flex gap-1 rounded-lg bg-background p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Yukleniyor...</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Bu listede kayit yok.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((report) => (
            <div key={report.id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Sikayet Eden: {report.reporter?.username || "Bilinmeyen"}
                </p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={report.status} />
                  <button
                    onClick={() => handleDelete(report.id)}
                    disabled={deletingId === report.id}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {deletingId === report.id ? "Siliniyor" : "Sil"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sikayet Edilen: {report.reported_user?.username || "Bilinmeyen"}
              </p>
              <p className="mt-2 text-sm text-foreground/90">
                Mesaj: {report.message_content || "Mesaj içeriği bulunamadı"}
              </p>
              <p className="mt-1 text-sm text-foreground">
                Sebep: {report.reason || "Sebep belirtilmemis"}
              </p>
              {report.resolution_note && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cozum Notu: {report.resolution_note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
