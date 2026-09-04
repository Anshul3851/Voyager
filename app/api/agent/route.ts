import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function fallback(message: string) {
  const q = message.toLowerCase();
  const cities = [
    "Delhi","Agra","Jaipur","Udaipur","Ahmedabad","Mumbai","Goa",
    "Bengaluru","Kochi","Amritsar","Varanasi","Hyderabad"
  ].filter((city) => q.includes(city.toLowerCase()));

  const people = q.match(/(\d+)\s*(people|persons|friends|travellers|travelers|pax)/i);
  const budget = q.match(/(?:under|below|budget|₹|rs\.?)\s*([\d,]+)/i);

  if (cities.length >= 2) {
    const route = cities.slice(0, 8);
    return {
      reply: `I mapped your route as ${route.join(" → ")}. Voyager can now turn it into a Trip Room and executable plans.`,
      intent: "plan",
      route,
      travellers: people ? Number(people[1]) : null,
      budget_per_person: budget ? Number(budget[1].replace(/,/g, "")) : null,
      style: null,
      nextAction: "create_trip",
      fallback: true,
    };
  }

  if (q.includes("profile") || q.includes("settings")) {
    return {
      reply: "Open your Profile to manage traveller details, defaults and agent permissions.",
      intent: "profile",
      route: [],
      travellers: null,
      budget_per_person: null,
      style: null,
      nextAction: "open_profile",
      fallback: true,
    };
  }

  if (q.includes("hotel") || q.includes("risk") || q.includes("verify")) {
    return {
      reply: "Voyager checks price stability, cancellation flexibility, listing consistency and trust signals before financial consent.",
      intent: "verify",
      route: [],
      travellers: null,
      budget_per_person: null,
      style: null,
      nextAction: "open_verification",
      fallback: true,
    };
  }

  if (q.includes("recover") || q.includes("cancel") || q.includes("disruption")) {
    return {
      reply: "Voyager can open the recovery workspace to review affected travellers, alternatives and exact cost impact.",
      intent: "recover",
      route: [],
      travellers: null,
      budget_per_person: null,
      style: null,
      nextAction: "open_recovery",
      fallback: true,
    };
  }

  return {
    reply: "I can plan a route, compare options, explain hotel risk, manage your profile, or help recover a disrupted trip.",
    intent: "general",
    route: [],
    travellers: null,
    budget_per_person: null,
    style: null,
    nextAction: "none",
    fallback: true,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body?.message ?? "").trim();

    if (!message) {
      return NextResponse.json({ error: "Please enter a travel request." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        provider: "local",
        ...fallback(message),
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";

      const prompt = `
You are Voyager, an AI group travel agent.
Extract the ordered route, traveller count, budget and travel style.
Never claim live inventory, prices, booking, payment or flight status.
If the user says "back to X", include X as the final stop.

User:
${message}

Return JSON only:
{
  "reply": "friendly concise response",
  "intent": "plan | compare | verify | recover | profile | general",
  "route": ["city"],
  "travellers": number | null,
  "budget_per_person": number | null,
  "style": "Relaxed | Balanced | Adventure | Luxury | null",
  "nextAction": "create_trip | open_plans | open_verification | open_recovery | open_profile | none"
}
`;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const raw = response.text?.trim() || "";
      let result: any;

      try {
        result = JSON.parse(raw);
      } catch {
        result = { reply: raw || fallback(message).reply, intent: "general", route: [], nextAction: "none" };
      }

      return NextResponse.json({ ok: true, provider: "gemini", model, ...result });
    } catch (providerError) {
      // Gemini can temporarily return 503 when a model is busy.
      console.warn("Gemini unavailable; using local Voyager fallback.", providerError);
      return NextResponse.json({
        ok: true,
        provider: "local-fallback",
        ...fallback(message),
      });
    }
  } catch (error) {
    console.error("Voyager agent error:", error);
    return NextResponse.json({
      ok: true,
      provider: "local-fallback",
      ...fallback("general travel help"),
    });
  }
}
