import { Ollama } from "ollama";
import { Catalogue, MissingMember } from "../types.js";
import { loadPlannerPrompt } from "../prompts/loader.js";

export interface PlanResult {
  missingMembers: MissingMember[];
  success: boolean;
  error?: string;
}

/**
 * Check whether a member (locator or method) already exists in the catalogue.
 */
function memberExists(
  catalogue: Catalogue,
  className: string,
  name: string,
  type: "locator" | "method"
): boolean {
  const pom = catalogue.poms.find(p => p.className === className);
  if (!pom) return false;
  if (type === "locator") {
    return pom.publicLocators.some(l => l.name === name);
  } else {
    return pom.publicMethods.some(m => m.name === name);
  }
}

/**
 * Call a small, fast model to analyse the test description and detect missing POM members.
 */
export async function planTest(
  testDescription: string,
  catalogue: Catalogue,
  options: {
    plannerModel?: string;
    ollamaHost?: string;
    timeoutMs?: number;
  }
): Promise<PlanResult> {
  const model = options.plannerModel ?? "qwen2.5-coder:1.5b";
  const ollama = new Ollama({ host: options.ollamaHost ?? "http://localhost:11434" });

  const prompt = loadPlannerPrompt();
  
  // Build a compact summary of the catalogue (only class names + method/locator names)
  const catalogueSummary = buildCatalogueSummary(catalogue);
  
  const userMessage = `
Test description:
${testDescription}

Existing POM members (class -> methods/locators):
${catalogueSummary}

Analyse the test and output JSON with missing members (if any).
`;

  const response = await ollama.chat({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: userMessage },
    ],
    options: { temperature: 0.1 },
  });

  const content = response.message.content;
  let parsed;
  try {
    // Extract JSON from response (might be wrapped in ```json ... ```)
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/({[\s\S]*})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { missingMembers: [], success: false, error: `Failed to parse planner output: ${content}` };
  }

  if (!parsed.missingMembers || !Array.isArray(parsed.missingMembers)) {
    return { missingMembers: [], success: false, error: "Planner output missing 'missingMembers' array" };
  }

  // Validate each missing member has required fields and filter out those that already exist
  const validMembers: MissingMember[] = [];
  for (const m of parsed.missingMembers) {
    if (m.className && m.memberType && m.name && m.rationale) {
      // Skip if the member already exists in the catalogue
      if (memberExists(catalogue, m.className, m.name, m.memberType)) {
        console.log(`  Planner: skipping existing member ${m.className}.${m.name} (${m.memberType})`);
        continue;
      }
      validMembers.push(m as MissingMember);
    }
  }

  return { missingMembers: validMembers, success: true };
}

function buildCatalogueSummary(catalogue: Catalogue): string {
  const lines: string[] = [];
  for (const pom of catalogue.poms) {
    const locators = pom.publicLocators.map(l => l.name).join(", ");
    const methods = pom.publicMethods.map(m => m.name).join(", ");
    lines.push(`${pom.className}:`);
    if (locators) lines.push(`  locators: ${locators}`);
    if (methods) lines.push(`  methods: ${methods}`);
  }
  return lines.join("\n");
}