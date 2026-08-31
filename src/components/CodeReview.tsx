import { useCallback, useEffect, useMemo, useState } from "react";
import { AppSpec } from "@/types/appSpec";
import { GeneratedFile } from "@/types/generatedProject";
import { BuildContract } from "@/types/generatedProject";
import { ReviewFinding, ReviewReport, ReviewRoadmapStep, ReviewSection, ReviewStage, RoadmapRepairResult } from "@/types/review";
import { planReviewStages, repairRoadmapStep, reviewCodebase, RoadmapRepairError } from "@/lib/reviewCodebase";
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
  Route,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeReviewProps {
  spec: AppSpec | null;
  generatedFiles: GeneratedFile[];
  onFilesChange?: (files: GeneratedFile[]) => void;
}

const REPORT_KEY = "nlp-programmer:last-review";
const HISTORY_KEY = "nlp-programmer:review-history";
const UPLOAD_KEY = "nlp-programmer:review-upload";
const CONTRACT_KEY = "nlp-programmer:last-contract";
const DIRECTIVES_KEY = "nlp-programmer:review-directives";

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
  const [history, setHistory] = useState<ReviewReport[]>(() => loadJson<ReviewReport[]>(HISTORY_KEY) ?? []);
  const [fixingStep, setFixingStep] = useState<string | null>(null);
  const [lastRepair, setLastRepair] = useState<RoadmapRepairResult | null>(null);
  const [directives, setDirectives] = useState<string[]>(() => loadJson<string[]>(DIRECTIVES_KEY) ?? []);
  const [draft, setDraft] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(DIRECTIVES_KEY, JSON.stringify(directives));
    } catch {
      // ignore
    }
  }, [directives]);


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
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-5)));
    } catch {
      // ignore
    }
  }, [history]);

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

  const parkedSteps = useMemo(
    () => (report?.roadmap ?? []).filter((step) => step.status === "blocked" || step.status === "dismissed"),
    [report],
  );
  const activeSteps = useMemo(
    () => (report?.roadmap ?? []).filter((step) => step.status !== "blocked" && step.status !== "dismissed"),
    [report],
  );

  const handleRun = useCallback(async () => {
    if (!files.length) {
      toast({ title: "Ingen kodbas att granska", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    const previous = report;
    setLastRepair(null);
    setStages(planReviewStages().map<ReviewStage>((s) => ({ ...s, status: "pending" })));

    const update = (id: string, patch: Partial<ReviewStage>) =>
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    try {
      const result = await reviewCodebase(files, useUpload ? null : spec, source, {
        onStageStart: (id) => update(id, { status: "running" }),
        onStageDone: (id) => update(id, { status: "done" }),
        onStageError: (id, error) => update(id, { status: "error", error }),
      }, previous, {
        directives,
        excluded: parkedSteps.map((step) => ({
          title: step.title,
          reason: step.status === "dismissed" ? "avfärdad av användaren" : "blockerad av externt hinder",
        })),
      });
      setReport(result);
      setHistory((current) => [...current.filter((item) => item.generatedAt !== result.generatedAt), result].slice(-5));
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
  }, [files, spec, source, useUpload, toast, report, directives, parkedSteps]);

  const handleRepairStep = useCallback(
    async (step: ReviewRoadmapStep) => {
      if (!report) return;
      setFixingStep(step.id);
      setLastRepair(null);
      try {
        const contract = useUpload ? null : loadJson<BuildContract>(CONTRACT_KEY);
        const result = await repairRoadmapStep(useUpload ? null : spec, report, step, files, contract, directives);
        if (result.changedPaths.length) {
          if (useUpload) setUploaded(result.files);
          else onFilesChange?.(result.files);
        }
        setLastRepair(result);
        setReport((current) => current ? {
          ...current,
          roadmap: current.roadmap.map((item) => item.id === step.id ? {
            ...item,
            status: result.status,
            attempts: [...(item.attempts ?? []), result.attempt],
          } : item),
        } : current);
        toast({
          title: result.status === "blocked" ? "Etappen har en extern blockerare" : "Roadmap-etappen tillämpad",
          description: result.status === "blocked"
            ? "Säkra kodändringar sparades och etappen flyttas ned till parkerade punkter, så att nya åtgärder får plats."
            : `${result.changedPaths.length} samverkande fil(er) uppdaterades utan statisk regression. Kör en ny helhetsgranskning för verifiering.`,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Okänt fel";
        const attempt = e instanceof RoadmapRepairError ? e.attempt : null;
        if (attempt) {
          setReport((current) => current ? {
            ...current,
            roadmap: current.roadmap.map((item) => item.id === step.id ? {
              ...item,
              attempts: [...(item.attempts ?? []), attempt],
            } : item),
          } : current);
        }
        const isFirstTransient = attempt?.category === "transient";
        toast({
          title: "Kunde inte åtgärda",
          description: isFirstTransient
            ? `${message} Första gången detta ser ut som ett tillfälligt fel — upprepas det räknas det som en misslyckad strategi och nästa försök tvingas byta väg.`
            : `${message} Försöket är sparat som misslyckat: nästa försök måste använda en annan strategi, annars avfärda eller styr om etappen med en riktlinje.`,
          variant: "destructive",
        });
      } finally {
        setFixingStep(null);
      }
    },
    [files, spec, useUpload, onFilesChange, toast, report, directives],
  );

  const handleDismissStep = useCallback((stepId: string) => {
    setReport((current) => current ? {
      ...current,
      roadmap: current.roadmap.map((item) => item.id === stepId ? { ...item, status: "dismissed" as const } : item),
    } : current);
    toast({
      title: "Etappen avfärdad",
      description: "Punkten flyttas ned bland parkerade och tas inte upp igen vid nästa granskning.",
    });
  }, [toast]);

  const handleApplyDirectives = useCallback(async () => {
    if (!report || !directives.length) return;
    await handleRepairStep({
      id: `directive-${Date.now()}`,
      order: 0,
      title: "Användarriktlinjer",
      objective: `Genomför användarens riktlinjer i hela kodbasen: ${directives.join(" | ")}`,
      rationale: "Riktlinjerna överordnar spec och tidigare rekommendationer.",
      findingIds: [],
      paths: [],
      dependsOn: [],
      acceptanceCriteria: directives.map((item) => `Riktlinjen är helt genomförd: ${item}`),
      status: "pending",
      attempts: [],
    });
  }, [report, directives, handleRepairStep]);

  const addDirective = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    setDirectives((current) => [...current, value].slice(-20));
    setDraft("");
  }, [draft]);


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

            {report.delta && (
              <div className={cn(
                "rounded-lg border p-3 space-y-1",
                report.delta.completeness >= 0 && report.delta.critical <= 0 && report.delta.major <= 0
                  ? "border-primary/30 bg-primary/5"
                  : "border-destructive/40 bg-destructive/10",
              )}>
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  {report.delta.completeness >= 0 ? <Route className="h-3.5 w-3.5 text-primary" /> : <ShieldAlert className="h-3.5 w-3.5 text-destructive" />}
                  Förändring sedan föregående granskning
                </p>
                <p className="text-xs text-muted-foreground">
                  Färdighetsgrad {report.delta.completeness >= 0 ? "+" : ""}{report.delta.completeness} procentenheter · lösta {report.delta.resolved.length} · kvar {report.delta.remaining.length} · nya {report.delta.introduced.length}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  Kritiska {report.delta.critical >= 0 ? "+" : ""}{report.delta.critical} · allvarliga {report.delta.major >= 0 ? "+" : ""}{report.delta.major}
                </p>
              </div>
            )}

            {activeSteps.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5 text-primary" /> Roadmap till byggbar app
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Varje etapp repareras atomiskt med hela projektet som kontext. Blockerade och avfärdade punkter flyttas längst ned och tar ingen plats i listan.</p>
                </div>
                {activeSteps.map((step) => {
                  const dependenciesReady = step.dependsOn.every((id) =>
                    report.roadmap.some((candidate) => candidate.id === id && candidate.status && candidate.status !== "pending"),
                  );
                  return (
                    <div key={step.id} className="border-l-2 border-primary/30 pl-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-primary shrink-0">{step.order}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground">{step.title}</p>
                          <p className="text-xs text-muted-foreground">{step.objective}</p>
                        </div>
                      </div>
                      {step.dependsOn.length > 0 && <p className="text-[10px] font-mono text-muted-foreground">Beroenden: {step.dependsOn.join(", ")}</p>}
                      {step.acceptanceCriteria.map((criterion, index) => (
                        <p key={index} className="text-[10px] text-muted-foreground">✓ {criterion}</p>
                      ))}
                      {(step.attempts?.length ?? 0) > 0 && (
                        <div className="rounded-md border border-border bg-surface-code p-2 space-y-1">
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {step.attempts?.length} tidigare försök · identiska strategier spärras
                          </p>
                          {step.attempts?.slice(-2).map((attempt) => (
                            <p key={attempt.id} className="text-[10px] text-muted-foreground">
                              {attempt.outcome === "failed" ? "Avvisad" : attempt.outcome === "blocked" ? "Blockerad" : "Tillämpad"}: {attempt.strategySummary ?? attempt.reason ?? "Tekniskt fel före strategival"}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={step.status === "applied" ? "outline" : "default"}
                          className="h-7 gap-1.5 text-xs"
                          disabled={!dependenciesReady || fixingStep !== null || step.status === "applied"}
                          onClick={() => void handleRepairStep(step)}
                        >
                          {fixingStep === step.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />}
                          {step.status === "applied" ? "Tillämpad — inväntar ny granskning" : dependenciesReady ? (step.attempts?.length ? "Försök med annan strategi" : "Åtgärda denna etapp") : "Inväntar föregående etapp"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 text-xs text-muted-foreground"
                          disabled={fixingStep !== null}
                          onClick={() => handleDismissStep(step.id)}
                        >
                          <Ban className="h-3.5 w-3.5" /> Avfärda
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}


            {lastRepair && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                <p className="text-xs font-medium text-foreground">Senaste reparationsbatch</p>
                <p className="text-xs text-muted-foreground">{lastRepair.changedPaths.length} filer ändrade · statiska avvikelser {lastRepair.lintBefore} → {lastRepair.lintAfter}</p>
                <p className="text-xs text-muted-foreground">Strategi: {lastRepair.strategySummary}</p>
                {lastRepair.differenceFromPrevious && <p className="text-xs text-muted-foreground">Skillnad: {lastRepair.differenceFromPrevious}</p>}
                {lastRepair.blockers.map((blocker, index) => <p key={index} className="text-xs text-accent">Blockerare: {blocker.detail} — {blocker.requiredAction}</p>)}
                {lastRepair.manualFollowUps.map((item, index) => <p key={index} className="text-xs text-accent">Manuellt: {item}</p>)}
              </div>
            )}

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
