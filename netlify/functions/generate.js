// netlify/functions/generate.js
//
// This function runs on Netlify's server (not in the browser).
// It receives the client's assessment answers, securely calls the
// Anthropic API using a hidden environment variable API key, and
// returns the generated plan back to the website.
//
// Your ANTHROPIC_API_KEY is NEVER exposed to visitors — it stays
// safely on the server.

exports.handler = async function (event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // CORS headers so your website can call this function
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  try {
    const { answers } = JSON.parse(event.body);

    if (!answers || !answers.name) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing assessment data" }),
      };
    }

    // Build the AI prompt (same logic as before)
    const summary = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const isGym = (answers.location || "").includes("gym");
    const isHome = (answers.location || "").includes("home");
    const locNote =
      isGym && isHome
        ? "Client trains BOTH gym and home. Provide gym exercises for gym days and bodyweight alternatives for home days."
        : isHome
        ? "Client trains AT HOME ONLY. Use bodyweight, resistance bands and basic dumbbells only. No gym machines."
        : "Client trains AT THE GYM. Use full gym equipment — machines, free weights, cables, barbells.";

    const prompt = `You are Chris, a certified personal trainer at Muscle & Fitness Personal Training Studio, Montana Park, Pretoria. Warm, direct South African tone. Never mention AI or Claude. Be concise — short sentences.

${locNote}

Generate a personalised 6-week programme. Use **bold** for ALL headings. Be brief — this must be fast to generate.

**Welcome**
2 sentences using their name, age and goal.

**Phase 1 — Weeks 1-3: Foundation**
3 training days (list day + type). For each day list 4 exercises as: Name — sets x reps — 1 short how-to sentence. Plus 1 rest day note.

**Phase 2 — Weeks 4-6: Progression**
Same 3 days, increased intensity. 4 exercises each, same brief format.

**Cardio & Warm-up/Cool-down**
2 sentences cardio. 3 warm-up moves, 3 cool-down moves, listed briefly.

**Nutrition**
Calorie range. Protein/carb/fat targets. 4 foods to eat, 4 to avoid. 3-meal sample plan (brief). Water target.

**Check-ins**
Week 1, 3, 6 — one line each on what to send Chris.

**Closing**
1 sentence sign-off from Chris. Include 076 495 7847.

Then write exactly: ---COACH---

**Health Flags**
Brief — conditions to monitor.

**Session 1 Tests**
List 2-3 baseline tests.

**Notes**
1-2 lines on modifications needed. Stress: ${answers.stress || "—"}/10. Motivation: ${answers.motivation || "—"}.

**Milestones**
Week 3 and Week 6 targets, 1 line each.

CLIENT:
${summary}`;

    // Call Anthropic securely from the server.
    // max_tokens reduced + prompt shortened so this reliably finishes
    // within Netlify's 10-second free-tier function limit.
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic API error:", errText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "AI generation failed", details: errText }),
      };
    }

    const aiData = await aiRes.json();
    const fullText = (aiData.content || [])
      .map((b) => b.text || "")
      .join("\n");

    const clientPlan = fullText.split("---COACH---")[0] || fullText;
    const coachNotes = fullText.split("---COACH---")[1] || "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        clientPlan,
        coachNotes,
      }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
};
