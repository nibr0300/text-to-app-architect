import { useState, useCallback } from "react";
import { DescriptionInput } from "@/components/DescriptionInput";
import { SpecViewer } from "@/components/SpecViewer";
import { StreamingOutput } from "@/components/StreamingOutput";
import { streamSpec } from "@/lib/streamSpec";
import { AppSpec } from "@/types/appSpec";
import { useToast } from "@/hooks/use-toast";
import { Terminal, Smartphone } from "lucide-react";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [spec, setSpec] = useState<AppSpec | null>(null);
  const [rawJson, setRawJson] = useState("");
  const { toast } = useToast();

  const handleGenerate = useCallback((description: string) => {
    setIsLoading(true);
    setStreamText("");
    setSpec(null);
    setRawJson("");

    let accumulated = "";

    streamSpec({
      description,
      onDelta: (text) => {
        accumulated += text;
        setStreamText(accumulated);
      },
      onDone: () => {
        setIsLoading(false);
        try {
          // Try to extract JSON from the accumulated text
          let jsonStr = accumulated.trim();
          // Remove markdown code fences if present
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          const parsed = JSON.parse(jsonStr) as AppSpec;
          setSpec(parsed);
          setRawJson(JSON.stringify(parsed, null, 2));
          setStreamText("");
        } catch {
          setRawJson(accumulated);
          toast({
            title: "Parsing note",
            description: "The AI response couldn't be parsed as structured JSON. Showing raw output.",
            variant: "destructive",
          });
        }
      },
      onError: (error) => {
        setIsLoading(false);
        toast({ title: "Generation failed", description: error, variant: "destructive" });
      },
    });
  }, [toast]);

  return (
    <div className="min-h-screen bg-background dark">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              NLP Programmer
            </h1>
            <p className="text-xs text-muted-foreground">
              Describe → Architect → Build Android Apps
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Powered by Lovable AI</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="text-gradient">Text → Android App</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
            Describe your Android app in plain English. Our AI generates a complete 
            architectural specification — screens, data models, navigation, and theme.
          </p>
        </div>

        {/* Input */}
        <section>
          <DescriptionInput onGenerate={handleGenerate} isLoading={isLoading} />
        </section>

        {/* Output */}
        {isLoading && streamText && (
          <section>
            <StreamingOutput text={streamText} />
          </section>
        )}

        {spec && (
          <section>
            <SpecViewer spec={spec} rawJson={rawJson} />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="container max-w-4xl mx-auto px-4 text-center text-xs text-muted-foreground">
          NLP Programmer — Part of the Lovable ecosystem
        </div>
      </footer>
    </div>
  );
};

export default Index;
