import { useCallback, useEffect, useMemo, useState } from "react";
import { AppSpec } from "@/types/appSpec";
import { GeneratedFile } from "@/types/generatedProject";
import { ReviewFinding, ReviewReport, ReviewSection, ReviewStage } from "@/types/review";
import { planReviewStages, repairFinding, reviewCodebase } from "@/lib/reviewCodebase";
import { ZipUpload } from "@/components/ZipUpload";
import { FileTreeViewer } from "@/components/FileTreeViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  ScanSearch,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeReviewProps {
  spec: AppSpec | null;
  generatedFiles: GeneratedFile[];
  onFilesChange?: (files: GeneratedFile[]) => void;
}

const REPORT_KEY = "nlp-programmer:last-review";
const UPLOAD_KEY = "nlp-programmer:review-upload";

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const SEVERITY_LABEL: Record<ReviewFinding["severity"], string> = {
  critical: "Kritiskt",
  major: "Allvarligt",
  minor: "Mindre",
  info: "Info",
};

const SEVERITY_ORDER: ReviewFinding["severity"][] = ["critical", "major", "minor", "info"];

function SeverityBadge({ severity }: { severity: ReviewFinding["severity"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide border",
        severity === "critical" && "border-destructive/40 bg-destructive/10 text-destructive",
        severity === "major" && "border-accent/40 bg-accent/10 text-accent",
        severity === "minor" && "border-border bg-muted text-muted-foreground",
        severity === "info" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function CodeReview({ spec, generatedFiles, onFilesChange }: CodeReviewProps) {
  const [uploaded, setUploaded] = useState<GeneratedFile[]>(() => loadJson<GeneratedFile[]>(UPLOAD_KEY) ?? []);
  const [useUpload, setUseUpload] = useState(() => (loadJson<GeneratedFile[]>(UPLOAD_KEY) ?? []).length > 0);
  const [stages, setStages] = useState<ReviewStage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<ReviewReport | null>(() => loadJson<ReviewReport>(REPORT_KEY));
  const [fixing, setFixing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      if (report) localStorage.setItem(REPORT_KEY, JSON.stringify(report));
      else localStorage.removeItem(REPORT_KEY);
    } catch {
      // ignore
    }
  }, [report]);

  useEffect(() => {
    try {
      if (uploaded.length) localStorage.setItem(UPLOAD_KEY, JSON.stringify(uploaded));
      else localStorage.removeItem(UPLOAD_KEY);
    } catch {
      // ignore
    }
  }, [uploaded]);

  const files = useUpload ? uploaded : generatedFiles;
  const source: "generated" | "upload" = useUpload ? "upload" : "generated";

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const section of report?.sections ?? [])
      for (const f of section.findings) map[f.severity] = (map[f.severity] ?? 0) + 1;
    return map;
  }, [report]);

  const handleRun = useCallback(async () => {
    if (!files.length) {
      toast({ title: "Ingen kodbas att granska", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    setReport(null);
    setStages(planReviewStages().map<ReviewStage>((s) => ({ ...s, status: "pending" })));

    const update = (id: string, patch: Partial<ReviewStage>) =>
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    try {
      const result = await reviewCodebase(files, useUpload ? null : spec, source, {
        onStageStart: (id) => update(id, { status: "running" }),
        onStageDone: (id) => update(id, { status: "done" }),
        onStageError: (id, error) => update(id, { status: "error", error }),
      });
      setReport(result);
      toast({
        title: "Granskning klar",
        description: `Uppskattad färdighetsgrad: ${result.completeness}%.`,
      });
    } catch (e) {
      toast({
        title: "Granskningen avbröts",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }, [files, spec, source, useUpload, toast]);

  const handleFix = useCallback(
    async (finding: ReviewFinding) => {
      setFixing(finding.id);
      try {
        const fixed = await repairFinding(useUpload ? null : spec, finding, files);
        if (!fixed.length) throw new Error("AI:n returnerade inga ändrade filer.");
        const map = new Map(files.map((f) => [f.path, f]));
        for (const f of fixed) map.set(f.path, f);
        const merged = Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
        if (useUpload) setUploaded(merged);
        else onFilesChange?.(merged);
        toast({
          title: "Åtgärdad",
          description: `${fixed.length} fil(er) uppdaterade. Kör granskningen igen för att verifiera.`,
        });
      } catch (e) {
        toast({
          title: "Kunde inte åtgärda",
          description: e instanceof Error ? e.message : "Okänt fel",
          variant: "destructive",
        });
      } finally {
        setFixing(null);
      }
    },
    [files, spec, useUpload, onFilesChange, toast],
  );

  const renderSection = (section: ReviewSection) => {
    const sorted = [...section.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    return (
      <div key={section.id} className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{section.title}</span>
          <span className="text-xs text-muted-foreground">
            {sorted.length ? `${sorted.length} punkt(er)` : "inga anmärkningar"}
          </span>
        </div>
        {section.summary && <p className="text-xs text-muted-foreground">{section.summary}</p>}
        {sorted.map((finding) => (
          <div key={finding.id} className="rounded-md bg-surface-code p-2.5 space-y-1.5">
            <div className="flex items-start gap-2">
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs font-medium text-foreground min-w-0">{finding.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{finding.detail}</p>
            {finding.suggestion && (
              <p className="text-xs text-foreground/80">Åtgärd: {finding.suggestion}</p>
            )}
            {finding.paths.length > 0 && (
              <p className="text-[10px] font-mono text-muted-foreground break-all">
                {finding.paths.join("  ·  ")}
              </p>
            )}
            {finding.paths.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                disabled={fixing !== null}
                onClick={() => void handleFix(finding)}
              >
                {fixing === finding.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                Åtgärda med AI
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-primary" />
          Kodgranskning — oberoende djupanalys
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sluttest före APK-paketering, eller fristående granskning av en egen kodbas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={useUpload ? "outline" : "default"}
            onClick={() => setUseUpload(false)}
            disabled={generatedFiles.length === 0}
          >
            Genererat projekt ({generatedFiles.length})
          </Button>
          <Button
            size="sm"
            variant={useUpload ? "default" : "outline"}
            onClick={() => setUseUpload(true)}
          >
            Uppladdad ZIP ({uploaded.length})
          </Button>
        </div>

        {useUpload && (
          <ZipUpload
            onImported={(f) => {
              setUploaded(f);
              setUseUpload(true);
            }}
          />
        )}

        {files.length > 0 && (
          <div className="rounded-lg border border-border p-2 max-h-56 overflow-auto">
            <FileTreeViewer files={files} selected={null} onSelect={() => undefined} />
          </div>
        )}

        <Button onClick={handleRun} disabled={isRunning || files.length === 0} className="gap-2">
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {report ? "Granska igen" : "Starta djupgranskning"}
        </Button>

        {stages.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-surface-code p-3">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-2 text-xs font-mono">
                {stage.status === "done" && <Check className="h-3.5 w-3.5 text-primary" />}
                {stage.status === "running" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                {stage.status === "error" && <X className="h-3.5 w-3.5 text-destructive" />}
                {stage.status === "pending" && (
                  <span className="h-3.5 w-3.5 rounded-full border border-border" />
                )}
                <span
                  className={cn(
                    stage.status === "pending" && "text-muted-foreground/60",
                    stage.status === "error" && "text-destructive",
                  )}
                >
                  {stage.label}
                </span>
                {stage.error && <span className="text-destructive">— {stage.error}</span>}
              </div>
            ))}
          </div>
        )}

        {report && (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">{report.completeness}%</span>
                <span className="text-xs text-muted-foreground">
                  uppskattad färdighetsgrad · {report.fileCount} filer ·{" "}
                  {report.source === "upload" ? "uppladdad kodbas" : "genererat projekt"}
                </span>
              </div>
              <p className="text-xs text-foreground">{report.verdict}</p>
              <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                {SEVERITY_ORDER.filter((s) => counts[s]).map((s) => (
                  <span key={s} className="text-muted-foreground">
                    {SEVERITY_LABEL[s]}: {counts[s]}
                  </span>
                ))}
              </div>
            </div>

            {report.strengths.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" /> Styrkor
                </p>
                {report.strengths.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    • {s}
                  </p>
                ))}
              </div>
            )}

            {report.sections.map(renderSection)}

            {report.nextSteps.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent" /> Prioriterad åtgärdslista
                </p>
                {report.nextSteps.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {i + 1}. {s}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              Granskad {new Date(report.generatedAt).toLocaleString("sv-SE")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
