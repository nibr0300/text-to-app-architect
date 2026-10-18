import { useMemo, useState } from "react";
import { AppSpec } from "@/types/appSpec";
import { buildContractYaml, getAcceptanceTests } from "@/lib/appContract";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, CheckCircle2, Circle, Copy, Check, FileCode2, ListChecks, RotateCcw, Pencil } from "lucide-react";

interface ContractViewerProps {
  spec: AppSpec;
  approved: boolean;
  onApproveChange: (approved: boolean, contractYaml: string) => void;
}

export function ContractViewer({ spec, approved, onApproveChange }: ContractViewerProps) {
  const generatedYaml = useMemo(() => buildContractYaml(spec), [spec]);
  const [editedYaml, setEditedYaml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const yaml = editedYaml ?? generatedYaml;
  const tests = useMemo(() => getAcceptanceTests(spec), [spec]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleReset = () => {
    setEditedYaml(null);
    onApproveChange(false, generatedYaml);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-green">
            <ScrollText className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-xl flex items-center gap-2">
              Steg 01 — App Contract
              {approved ? (
                <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Godkänt
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground gap-1">
                  <Circle className="h-3.5 w-3.5" /> Ej godkänt
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Kontraktet är den auktoritativa målbilden — härledd direkt från specen utan extra AI-anrop.
              Granska, justera vid behov och godkänn innan kodgenerering.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="contract" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-secondary/50">
            <TabsTrigger value="contract" className="text-xs">
              <FileCode2 className="h-3.5 w-3.5 mr-1" /> Kontrakt (YAML)
            </TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">
              <ListChecks className="h-3.5 w-3.5 mr-1" /> Acceptanstester ({tests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contract" className="mt-4 space-y-3">
            {editing ? (
              <Textarea
                value={yaml}
                onChange={(e) => {
                  setEditedYaml(e.target.value);
                  onApproveChange(false, e.target.value);
                }}
                className="min-h-[320px] bg-surface-code border-border font-mono text-xs text-foreground resize-y"
              />
            ) : (
              <div className="rounded-lg bg-surface-code border border-border p-4 overflow-auto max-h-[420px]">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{yaml}</pre>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing((v) => !v)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> {editing ? "Visa färdigt" : "Redigera"}
              </Button>
              {editedYaml !== null && (
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Återställ
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Kopierat" : "Kopiera"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tests" className="mt-4">
            <div className="rounded-lg bg-surface-code border border-border p-4 space-y-2 max-h-[420px] overflow-auto">
              {tests.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-primary shrink-0">{t.id}</span>
                  <span className="text-foreground">{t.text}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Button
          onClick={() => onApproveChange(!approved, yaml)}
          className={approved
            ? "w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            : "w-full bg-primary hover:bg-primary/90 glow-green font-semibold"}
          size="lg"
        >
          {approved ? (
            <>
              <RotateCcw className="mr-2 h-4 w-4" /> Ångra godkännande
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Godkänn kontrakt och gå vidare
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
