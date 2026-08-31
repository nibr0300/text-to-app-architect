import { useCallback, useMemo, useState } from "react";
import { AppSpec } from "@/types/appSpec";
import { GeneratedFile, GenStage } from "@/types/generatedProject";
import {
  downloadProjectZip,
  generateProject,
  planStages,
  regenerateFile,
} from "@/lib/generateCode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Copy,
  Download,
  Hammer,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileTreeViewer } from "@/components/FileTreeViewer";

interface CodeGeneratorProps {
  spec: AppSpec;
  files: GeneratedFile[];
  onFilesChange: (files: GeneratedFile[]) => void;
}

export function CodeGenerator({ spec, files, onFilesChange }: CodeGeneratorProps) {
  const [stages, setStages] = useState<GenStage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selected) ?? files[0] ?? null,
    [files, selected],
  );

  const handleGenerate = useCallback(async () => {
    setIsRunning(true);
    const planned = planStages(spec).map<GenStage>((s) => ({ ...s, status: "pending" }));
    setStages(planned);
    onFilesChange([]);

    const update = (id: string, patch: Partial<GenStage>) =>
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    try {
      const all = await generateProject(spec, {
        onStageStart: (id) => update(id, { status: "running" }),
        onStageDone: (id, _files, allFiles) => {
          update(id, { status: "done" });
          onFilesChange([...allFiles]);
        },
        onStageError: (id, error) => update(id, { status: "error", error }),
      });
      onFilesChange(all);
      setSelected(all[0]?.path ?? null);
      toast({ title: "Android-projekt klart", description: `${all.length} filer genererade.` });
    } catch (e) {
      toast({
        title: "Kodgenerering avbröts",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }, [spec, onFilesChange, toast]);

  const handleCopy = useCallback(async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedFile]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedFile) return;
    setRegenerating(true);
    try {
      const updated = await regenerateFile(spec, selectedFile, files);
      const map = new Map(files.map((f) => [f.path, f]));
      for (const f of updated) map.set(f.path, f);
      onFilesChange(Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path)));
      toast({ title: "Filen regenererad" });
    } catch (e) {
      toast({
        title: "Regenerering misslyckades",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  }, [selectedFile, spec, files, onFilesChange, toast]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadProjectZip(spec.appName || "android-app", files);
    } catch {
      toast({ title: "Kunde inte skapa ZIP", variant: "destructive" });
    }
  }, [spec.appName, files, toast]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Hammer className="h-4 w-4 text-primary" />
          Kodgenerering — Android-projekt (Kotlin)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Genererar ett komplett Gradle-projekt från specen, redo att öppna i Android Studio.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleGenerate} disabled={isRunning} className="gap-2">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
            {files.length ? "Generera om projektet" : "Generera Android-projekt"}
          </Button>
          {files.length > 0 && (
            <Button variant="outline" onClick={handleDownload} className="gap-2">
              <Download className="h-4 w-4" />
              Ladda ner ZIP ({files.length} filer)
            </Button>
          )}
        </div>

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
                    stage.status === "done" && "text-foreground",
                  )}
                >
                  {stage.label}
                </span>
                {stage.error && <span className="text-destructive">— {stage.error}</span>}
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border p-2">
              <FileTreeViewer files={files} selected={selectedFile?.path ?? null} onSelect={setSelected} />
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                  {selectedFile?.path}
                </span>
                <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1 text-xs">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Kopiera
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="h-7 gap-1 text-xs"
                >
                  {regenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerera
                </Button>
              </div>
              <pre className="bg-surface-code p-3 text-[11px] font-mono text-foreground overflow-auto max-h-[420px] whitespace-pre">
                {selectedFile?.content}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
