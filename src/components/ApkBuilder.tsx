import { useCallback, useEffect, useRef, useState } from "react";
import { GeneratedFile } from "@/types/generatedProject";
import {
  ApkBuildState,
  downloadApk,
  getBuildLogs,
  getBuildStatus,
  startApkBuild,
} from "@/lib/buildApk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Package,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BUILD_KEY = "nlp-programmer:last-build";

interface StoredBuild {
  buildId: string;
  appName: string;
  runUrl?: string;
  state: ApkBuildState;
}

interface ApkBuilderProps {
  appName: string;
  files: GeneratedFile[];
}

const STEP_LABELS: { state: ApkBuildState; label: string }[] = [
  { state: "pushing", label: "Skickar projektet till byggservern" },
  { state: "queued", label: "Bygget köar hos GitHub Actions" },
  { state: "building", label: "Kompilerar med Gradle (JDK 17 + Android SDK)" },
  { state: "success", label: "APK paketerad och redo" },
];

const ORDER: ApkBuildState[] = ["pushing", "queued", "building", "success"];

export function ApkBuilder({ appName, files }: ApkBuilderProps) {
  const [state, setState] = useState<ApkBuildState>("idle");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [runUrl, setRunUrl] = useState<string | undefined>();
  const [logLines, setLogLines] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BUILD_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredBuild;
      if (stored.buildId) {
        setBuildId(stored.buildId);
        setState(stored.state === "pushing" ? "queued" : stored.state);
        setRunUrl(stored.runUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const persist = useCallback((next: StoredBuild) => {
    try {
      localStorage.setItem(BUILD_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await getBuildStatus(id);
          setState(status.state);
          setRunUrl(status.runUrl);
          persist({ buildId: id, appName, runUrl: status.runUrl, state: status.state });
          if (status.state === "success" || status.state === "failed") {
            stopPolling();
            if (status.state === "failed") {
              try {
                const logs = await getBuildLogs(id);
                setLogLines(logs.lines);
              } catch {
                setLogLines([]);
              }
            }
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Kunde inte läsa byggstatus.");
        }
      }, 10_000);
    },
    [appName, persist, stopPolling],
  );

  const handleBuild = useCallback(async () => {
    setError(null);
    setLogLines([]);
    setState("pushing");
    try {
      const result = await startApkBuild(appName, files);
      setBuildId(result.buildId);
      setState("queued");
      persist({ buildId: result.buildId, appName, state: "queued" });
      poll(result.buildId);
      toast({
        title: "Bygget är startat",
        description: `${result.fileCount} filer skickade. Det tar oftast 3–6 minuter.`,
      });
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : "Kunde inte starta bygget.");
    }
  }, [appName, files, persist, poll, toast]);

  const handleResume = useCallback(() => {
    if (buildId) poll(buildId);
  }, [buildId, poll]);

  const handleDownload = useCallback(async () => {
    if (!buildId) return;
    setDownloading(true);
    try {
      const result = await downloadApk(buildId);
      toast({
        title: "APK nedladdad",
        description: `${result.fileName} (${Math.round(result.sizeBytes / 1024 / 1024 * 10) / 10} MB)`,
      });
    } catch (e) {
      toast({
        title: "Nedladdning misslyckades",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }, [buildId, toast]);

  const handleSendToReview = useCallback(() => {
    if (!logLines.length) return;
    window.dispatchEvent(
      new CustomEvent("nlp:build-errors", {
        detail: `Åtgärda dessa verkliga kompileringsfel från Gradle-bygget:\n${logLines
          .slice(-40)
          .join("\n")}`,
      }),
    );
    toast({
      title: "Byggfelen skickade till granskaren",
      description: "De ligger nu som riktlinje och styr nästa roadmap.",
    });
  }, [logLines, toast]);

  const isActive = state === "pushing" || state === "queued" || state === "building";
  const activeIndex = ORDER.indexOf(state);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          APK-bygge — installerbar app
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Projektet skickas till ett privat GitHub-repo och kompileras av GitHub Actions med JDK 17
          och Android SDK. Du får tillbaka en debug-signerad .apk du kan installera direkt på
          telefonen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleBuild} disabled={isActive || !files.length} className="gap-2">
            {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {isActive ? "Bygger…" : state === "success" ? "Bygg om APK" : "Bygg APK"}
          </Button>
          {state === "success" && (
            <Button variant="outline" onClick={handleDownload} disabled={downloading} className="gap-2">
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Ladda ner APK
            </Button>
          )}
          {buildId && !isActive && state !== "success" && (
            <Button variant="ghost" onClick={handleResume} className="gap-2 text-xs">
              Kontrollera status igen
            </Button>
          )}
          {runUrl && (
            <a
              href={runUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-center"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Byggloggen på GitHub
            </a>
          )}
        </div>

        {!files.length && (
          <p className="text-xs text-muted-foreground">
            Generera eller ladda upp ett Android-projekt först.
          </p>
        )}

        {state !== "idle" && (
          <div className="space-y-1 rounded-lg border border-border bg-surface-code p-3">
            {STEP_LABELS.map((step, index) => {
              const done = state === "success" ? true : index < activeIndex;
              const running = index === activeIndex && isActive;
              const failed = state === "failed" && index >= Math.max(activeIndex, 0);
              return (
                <div key={step.state} className="flex items-center gap-2 text-xs font-mono">
                  {done && <Check className="h-3.5 w-3.5 text-primary" />}
                  {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {failed && <X className="h-3.5 w-3.5 text-destructive" />}
                  {!done && !running && !failed && (
                    <span className="h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                  <span
                    className={cn(
                      !done && !running && "text-muted-foreground/60",
                      failed && "text-destructive",
                      done && "text-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
            {buildId && (
              <p className="pt-1 text-[11px] text-muted-foreground font-mono">bygg-id: {buildId}</p>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
            <span className="text-destructive">{error}</span>
          </div>
        )}

        {state === "failed" && logLines.length > 0 && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Kompilatorns felmeddelanden
            </div>
            <pre className="bg-surface-code p-3 text-[11px] font-mono text-foreground overflow-auto max-h-64 whitespace-pre-wrap">
              {logLines.join("\n")}
            </pre>
            <Button size="sm" variant="outline" onClick={handleSendToReview} className="gap-2 text-xs">
              <Send className="h-3.5 w-3.5" />
              Skicka byggfelen till granskaren
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
