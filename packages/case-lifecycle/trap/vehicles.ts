/**
 * Procedural vehicles for the Counsel Review (persona rollout plan §5 C/E).
 *
 * The strings are the ones the rest of the system already stores on
 * `Case.vehicle` ('11.07' | '11.071' | '11.072' | '11.09', schema.prisma)
 * plus the three the plan adds for counsel ('direct_appeal', 'pdr_clock',
 * '2254'). Note the per-finding `Vehicle` in analysis-fields.ts is a
 * different axis ('direct_appeal' | 'writ' | 'either' — which door a single
 * finding goes through); the package index exports this one as
 * `CounselVehicle` to keep the two apart.
 *
 * Screen ids are the analysis service's (apps/api/src/services/
 * analysis.service.ts, SCREENS_BY_LANE_V2), referenced by string so this
 * package stays free of api imports.
 */
export type Vehicle = 'direct_appeal' | 'pdr_clock' | '11.07' | '11.071' | '11.072' | '11.09' | '2254';

export const VEHICLE_IDS = ['direct_appeal', 'pdr_clock', '11.07', '11.071', '11.072', '11.09', '2254'] as const satisfies readonly Vehicle[];

export type ScreenId = 'preserved_error' | 'iac' | 'brady' | 'junk_science' | 'sentencing' | 'voir_dire' | 'identification' | 'plea_lane';

export type VectorChain = 'direct_appeal' | '11.07';

export interface VehicleSpec {
  id: Vehicle;
  label: string;
  /** Where the filing lands. */
  court: string;
  /** Who files it (the persona the packet is written for). */
  filedBy: string;
  /** Screens weighted first for this vehicle, in priority order. */
  weightedScreens: readonly ScreenId[];
  /** Which vector table the clock runs; null = no TRAP chain modelled yet. */
  chain: VectorChain | 'pdr' | null;
  /** The vehicle itself is outside the Counsel Review (plan §5 C: capital refused). */
  refused: boolean;
  refusedReason?: string;
  note: string;
}

const CAPITAL_REFUSED = 'Capital cases are refused for the Counsel Review (persona rollout plan §5 C).';

export const VEHICLES: Record<Vehicle, VehicleSpec> = {
  direct_appeal: {
    id: 'direct_appeal',
    label: 'Direct appeal',
    court: 'Court of appeals (one of the fourteen intermediate courts), then the Court of Criminal Appeals on PDR',
    filedBy: 'Appellate counsel (appointed or retained) — the PD appellate persona',
    weightedScreens: ['preserved_error', 'voir_dire', 'identification', 'sentencing', 'junk_science', 'iac', 'brady'],
    chain: 'direct_appeal',
    refused: false,
    note: 'Record claims only (four corners). IAC and Brady findings are listed so counsel can judge whether the record alone shows them; most are 11.07 material.',
  },
  pdr_clock: {
    id: 'pdr_clock',
    label: 'Petition for discretionary review (clock only)',
    court: 'Court of Criminal Appeals (TRAP 68.3: filed with the CCA clerk)',
    filedBy: 'Appellate counsel after the court of appeals judgment',
    weightedScreens: ['preserved_error', 'sentencing'],
    chain: 'pdr',
    refused: false,
    note: 'The engine reads trial records, not court-of-appeals opinions: PDR merits work is out of scope; the 49.1/68.2 clock and the TRAP 48.4 post-affirmance duty are in.',
  },
  '11.07': {
    id: '11.07',
    label: 'Art. 11.07 application (felony, post-conviction)',
    court: 'Filed with the clerk of the convicting court; returnable to the Court of Criminal Appeals',
    filedBy: 'Writ counsel (retained or appointed under Art. 1.051(d)(3)) — the writ practitioner persona',
    weightedScreens: ['iac', 'brady', 'junk_science', 'sentencing', 'identification', 'plea_lane', 'preserved_error'],
    chain: '11.07',
    refused: false,
    note: 'No statutory deadline; laches and the §4 subsequent-application bar govern. The CCA form (Revised 2018) is mandatory.',
  },
  '11.071': {
    id: '11.071',
    label: 'Art. 11.071 application (capital)',
    court: 'Convicting court, returnable to the Court of Criminal Appeals',
    filedBy: 'Appointed capital habeas counsel',
    weightedScreens: ['iac', 'brady', 'junk_science'],
    chain: null,
    refused: true,
    refusedReason: CAPITAL_REFUSED,
    note: 'Refused: capital work is outside the Counsel Review. Listed so an intake that names it gets a clear refusal instead of an unknown-vehicle error.',
  },
  '11.072': {
    id: '11.072',
    label: 'Art. 11.072 application (community supervision)',
    court: 'The court that imposed community supervision; appeal lies to the court of appeals',
    filedBy: 'Writ counsel',
    weightedScreens: ['plea_lane', 'iac', 'sentencing', 'brady'],
    chain: null,
    refused: false,
    note: 'Own timetable (Art. 11.072 §§6–8) and its own subsequent-application bar (§9); the TRAP chain is not modelled for it yet — the clock returns no steps and says so.',
  },
  '11.09': {
    id: '11.09',
    label: 'Art. 11.09 application (misdemeanor)',
    court: 'County court (or county court at law) of the county of confinement/conviction; appeal lies to the court of appeals',
    filedBy: 'Writ counsel',
    weightedScreens: ['plea_lane', 'iac', 'sentencing'],
    chain: null,
    refused: false,
    note: 'No statutory subsequent-application bar in Art. 11.09 as read here (proposed); no TRAP chain modelled yet.',
  },
  '2254': {
    id: '2254',
    label: '28 U.S.C. §2254 petition (federal habeas)',
    court: 'United States District Court (N.D., S.D., E.D. or W.D. Tex.), then the Fifth Circuit',
    filedBy: 'Federal habeas counsel',
    weightedScreens: ['iac', 'brady', 'junk_science', 'identification', 'preserved_error'],
    chain: null,
    refused: false,
    note: 'Governed by the AEDPA year (deadlines.ts) and exhaustion/procedural default (exhaustion-2254.ts); no TRAP steps.',
  },
};

export function isVehicle(v: unknown): v is Vehicle {
  return typeof v === 'string' && (VEHICLE_IDS as readonly string[]).includes(v);
}

export interface VehicleAcceptance {
  accepted: boolean;
  reason?: string;
}

/** Intake gate: a refused vehicle, or a capital case on any vehicle, is refused. */
export function vehicleAcceptance(vehicle: Vehicle, opts: { capital?: boolean }): VehicleAcceptance {
  const spec = VEHICLES[vehicle];
  if (spec.refused) return { accepted: false, reason: spec.refusedReason ?? CAPITAL_REFUSED };
  if (opts.capital) return { accepted: false, reason: CAPITAL_REFUSED };
  return { accepted: true };
}
