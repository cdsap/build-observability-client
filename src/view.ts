import type { AttributeValue, ObservationDataset, NormalizedObservation } from "./model.js";

export type ViewState = "ready" | "empty" | "partial" | "diagnostic" | "unknown";
export type ViewChart = "metric" | "table" | "histogram" | "none";

export interface ProfileMatch {
  readonly scopes?: readonly string[];
  readonly aggregationScopes?: readonly string[];
  readonly attributes?: Readonly<Record<string, AttributeValue | readonly AttributeValue[]>>;
  readonly measurements?: readonly string[];
  readonly histograms?: readonly string[];
  /** At least one of these names must be present when specified. */
  readonly anyMeasurements?: readonly string[];
  /** At least one of these names must be present when specified. */
  readonly anyHistograms?: readonly string[];
}

export interface ViewProfileContext {
  readonly observation: NormalizedObservation;
  readonly state: ViewState;
}

export interface ViewProfile {
  readonly id: string;
  readonly title: string;
  readonly priority: number;
  readonly match: ProfileMatch;
  readonly describe?: (context: ViewProfileContext) => string;
}

export interface ViewDataReference {
  readonly name: string;
  readonly unit?: string;
  readonly aggregation?: string;
}

export interface ViewPanel {
  readonly id: string;
  readonly title: string;
  readonly chart: ViewChart;
  readonly data: readonly ViewDataReference[];
  /** Deliberately semantic: renderers decide how dimensions are presented. */
  readonly dimensions: readonly string[];
}

export interface ViewSpec {
  readonly id: string;
  readonly profileId: string;
  readonly title: string;
  readonly state: ViewState;
  readonly scope: string;
  readonly aggregationScope: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly panels: readonly ViewPanel[];
  readonly diagnostics: readonly string[];
}

export interface ViewModel {
  readonly views: readonly ViewSpec[];
  readonly profiles: readonly ViewProfile[];
}

export interface ProfileRegistry {
  readonly profiles: readonly ViewProfile[];
  readonly register: (profile: ViewProfile) => ProfileRegistry;
  readonly match: (observation: NormalizedObservation) => ViewProfile;
}

const asValues = (value: AttributeValue | readonly AttributeValue[]): readonly AttributeValue[] => Array.isArray(value) ? value as readonly AttributeValue[] : [value as AttributeValue];
const names = (observation: NormalizedObservation, kind: "measurements" | "histograms"): readonly string[] =>
  (observation[kind] ?? []).map((entry) => entry.name);

function matches(observation: NormalizedObservation, condition: ProfileMatch): boolean {
  if (condition.scopes && !condition.scopes.includes(observation.scope)) return false;
  if (condition.aggregationScopes && !condition.aggregationScopes.includes(observation.aggregationScope)) return false;
  if (condition.attributes && !Object.entries(condition.attributes).every(([name, expected]) => {
    const actual = observation.attributes[name];
    return actual !== undefined && asValues(expected).includes(actual);
  })) return false;
  const measurements = names(observation, "measurements");
  const histograms = names(observation, "histograms");
  if (condition.measurements && !condition.measurements.every((name) => measurements.includes(name))) return false;
  if (condition.histograms && !condition.histograms.every((name) => histograms.includes(name))) return false;
  if (condition.anyMeasurements && !condition.anyMeasurements.some((name) => measurements.includes(name))) return false;
  if (condition.anyHistograms && !condition.anyHistograms.some((name) => histograms.includes(name))) return false;
  return true;
}

function semanticKey(observation: NormalizedObservation): string {
  const attributes = Object.keys(observation.attributes).sort().map((name) => `${name}=${JSON.stringify(observation.attributes[name])}`).join("&");
  const measurements = names(observation, "measurements").slice().sort().join(",");
  const histograms = names(observation, "histograms").slice().sort().join(",");
  return `${observation.scope}|${observation.aggregationScope}|${attributes}|m:${measurements}|h:${histograms}`;
}

function hash(value: string): string {
  let result = 0xcbf29ce484222325n;
  for (const character of value) {
    result ^= BigInt(character.codePointAt(0) as number);
    result = BigInt.asUintN(64, result * 0x100000001b3n);
  }
  return result.toString(16).padStart(16, "0");
}

export function stableViewId(profileId: string, observation: NormalizedObservation): string {
  return `${profileId}:${hash(semanticKey(observation))}`;
}

function stateFor(observation: NormalizedObservation): ViewState {
  if (observation.partial || (observation.diagnostics ?? []).some(({ severity }) => severity === "error")) return observation.partial ? "partial" : "diagnostic";
  if (!observation.measurements?.length && !observation.histograms?.length) return "empty";
  return "ready";
}

function panelsFor(observation: NormalizedObservation): readonly ViewPanel[] {
  const measurements = observation.measurements ?? [];
  const histograms = observation.histograms ?? [];
  const panels: ViewPanel[] = [];
  if (histograms.length) panels.push({ id: "distribution", title: "Distribution", chart: "histogram", data: histograms.map(({ name, unit, aggregation }) => ({ name, unit, aggregation })), dimensions: [] });
  if (measurements.length) {
    // Observations have no time axis. A line chart here would invent one, so
    // repeated or mixed aggregations remain a semantic table.
    const chart: ViewChart = measurements.length === 1 ? "metric" : "table";
    panels.push({ id: "measurements", title: "Measurements", chart, data: measurements.map(({ name, unit, aggregation }) => ({ name, unit, aggregation })), dimensions: Object.keys(observation.attributes).sort() });
  }
  return panels;
}

export const defaultViewProfiles: readonly ViewProfile[] = [
  { id: "jvm-process-summary", title: "JVM process summary", priority: 80, match: { scopes: ["jvm.process"], anyMeasurements: ["jvm.process.memory.heap.used", "jvm.process.memory.heap.limit", "jvm.process.cpu.time"] } },
  { id: "jvm-process-entities", title: "JVM processes", priority: 70, match: { scopes: ["jvm.process"] } },
  { id: "test-workers", title: "Test workers", priority: 90, match: { attributes: { "gradle.test.executor": ["test-worker", "test" ] } } },
  { id: "kotlin-daemons", title: "Kotlin daemons", priority: 90, match: { attributes: { "jvm.process.role": ["kotlin-daemon", "kotlin"] } } },
  { id: "gradle-daemons", title: "Gradle daemons", priority: 90, match: { attributes: { "jvm.process.role": ["gradle-daemon", "gradle"] } } },
  { id: "gc-actions", title: "Garbage collection actions", priority: 75, match: { scopes: ["jvm.gc"], anyMeasurements: ["jvm.gc.events", "jvm.gc.event.time"] } },
  { id: "gc-histograms", title: "Garbage collection distributions", priority: 85, match: { scopes: ["jvm.gc"], anyHistograms: ["jvm.gc.event.time"] } },
  { id: "artifacts", title: "Build artifacts", priority: 75, match: { scopes: ["build.artifact"], anyMeasurements: ["build.artifact.size"] } },
  { id: "generic", title: "Observations", priority: -1, match: {} },
];

export function createProfileRegistry(initial: readonly ViewProfile[] = defaultViewProfiles): ProfileRegistry {
  let profiles = Object.freeze([...initial]);
  const registry: ProfileRegistry = {
    get profiles() { return profiles; },
    register(profile) {
      if (!profile.id || !Number.isFinite(profile.priority)) throw new Error("A profile requires a non-empty id and finite priority.");
      if (profiles.some((entry) => entry.id === profile.id)) throw new Error(`Profile ${profile.id} is already registered.`);
      profiles = Object.freeze([...profiles, profile]);
      return registry;
    },
    match(observation) {
      return profiles.filter((profile) => matches(observation, profile.match)).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? defaultViewProfiles.at(-1) as ViewProfile;
    },
  };
  return registry;
}

export function registerProfile(registry: ProfileRegistry, profile: ViewProfile): ProfileRegistry {
  return registry.register(profile);
}

export function matchProfile(observation: NormalizedObservation, registry: ProfileRegistry = createProfileRegistry()): ViewProfile {
  return registry.match(observation);
}

export function buildViewModel(dataset: ObservationDataset, registry: ProfileRegistry = createProfileRegistry()): ViewModel {
  if (dataset.observations.length === 0) {
    return Object.freeze({
      views: Object.freeze([{
        id: "generic:empty", profileId: "generic", title: "Observations", state: "empty" as const,
        scope: "dataset", aggregationScope: "build", attributes: {}, panels: [],
        diagnostics: dataset.diagnostics.map(({ code }) => code),
      } satisfies ViewSpec]), profiles: registry.profiles,
    });
  }
  const views = dataset.observations.map((observation) => {
    const profile = registry.match(observation);
    const state = profile.id === "generic" && (observation.measurements?.length || observation.histograms?.length) ? "unknown" : stateFor(observation);
    const diagnostics = (observation.diagnostics ?? []).map(({ code }) => code);
    return {
      id: stableViewId(profile.id, observation), profileId: profile.id,
      title: profile.describe?.({ observation, state }) ?? profile.title,
      state, scope: observation.scope, aggregationScope: observation.aggregationScope,
      attributes: observation.attributes, panels: panelsFor(observation), diagnostics,
    } satisfies ViewSpec;
  });
  return Object.freeze({ views: Object.freeze(views), profiles: registry.profiles });
}

export const planViews: typeof buildViewModel = buildViewModel;
