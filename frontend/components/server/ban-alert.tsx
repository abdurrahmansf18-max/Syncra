"use client";
 
import { AlertCircle } from "lucide-react";
 
interface BanAlertProps {
  title?: string;
  message?: string;
  reason?: string;
  onReturn: () => void;
  returnButtonText?: string;
}
 
export function BanAlert({
  title = "Sunucudan Atıldınız",
  message = "Bu sunucudan banlandınız.",
  reason,
  onReturn,
  returnButtonText = "Sunuculara Dön",
}: BanAlertProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <AlertCircle className="h-16 w-16 text-destructive" />
      <div className="space-y-3">
        <p className="text-xl font-semibold text-foreground">{title}</p>
        <p className="text-base text-muted-foreground">{message}</p>
        {reason && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-muted-foreground">Sebep:</p>
            <p className="mt-1 text-lg font-bold text-destructive">{reason}</p>
          </div>
        )}
      </div>
      <button
        onClick={onReturn}
        className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {returnButtonText}
      </button>
    </div>
  );
}
 
 