import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `You are an expert Android app architect. Given a natural language description of an app, generate a detailed structured specification in JSON format.

The spec must include:
{
  "appName": "string",
  "packageName": "string (e.g. com.example.myapp)",
  "description": "string",
  "screens": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "isLauncher": boolean,
      "components": [
        {
          "type": "TextView|EditText|Button|ImageView|RecyclerView|FloatingActionButton|BottomNavigation|Toolbar|Card|Switch|Checkbox|RadioGroup|Spinner|ProgressBar|SearchBar",
          "id": "string",
          "properties": { ... },
          "events": [ { "type": "onClick|onTextChanged|onItemSelected", "action": "string" } ]
        }
      ],
      "layout": "LinearLayout|ConstraintLayout|FrameLayout|ScrollView"
    }
  ],
  "navigation": [
    { "from": "screenId", "to": "screenId", "trigger": "string" }
  ],
  "dataModels": [
    {
      "name": "string",
      "fields": [ { "name": "string", "type": "String|Int|Boolean|Float|Long|List<T>", "nullable": boolean } ]
    }
  ],
  "apis": [
    { "name": "string", "baseUrl": "string", "endpoints": [ { "method": "GET|POST|PUT|DELETE", "path": "string", "description": "string" } ] }
  ],
  "features": ["string"],
  "permissions": ["string"],
  "theme": {
    "primaryColor": "string (hex)",
    "secondaryColor": "string (hex)",
    "fontFamily": "string",
    "darkMode": boolean
  }
}

Be thorough and creative. Fill in realistic defaults where the user's description is vague. Always return valid JSON only, no markdown wrapping.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { description } = await req.json();
    if (!description) {
      return new Response(JSON.stringify({ error: "Description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-spec error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
