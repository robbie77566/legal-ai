/**
 * Workstream E — vehicle table and the counsel-signed vector table (E4).
 */
import { describe, it, expect } from 'vitest';
import {
  VEHICLES,
  VEHICLE_IDS,
  isVehicle,
  vehicleAcceptance,
  TRAP_CHAIN,
  DIRECT_APPEAL_CHAIN,
  WRIT_11_07_CHAIN,
  unsignedVectors,
  vectorById,
  ANDERS_CHECKLIST,
  andersItemsForScreen,
} from '../trap';

describe('E4 — vehicle table', () => {
  it('lists the seven vehicles with the strings the existing engine already uses', () => {
    expect([...VEHICLE_IDS]).toEqual(['direct_appeal', 'pdr_clock', '11.07', '11.071', '11.072', '11.09', '2254']);
    for (const id of VEHICLE_IDS) {
      const v = VEHICLES[id];
      expect(v.id).toBe(id);
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.court.length).toBeGreaterThan(3);
      expect(v.weightedScreens.length).toBeGreaterThan(0);
    }
    expect(isVehicle('11.07')).toBe(true);
    expect(isVehicle('writ')).toBe(false);
  });

  it('refuses 11.071 outright and refuses capital cases on every other vehicle', () => {
    expect(VEHICLES['11.071'].refused).toBe(true);
    expect(vehicleAcceptance('11.071', {})).toMatchObject({ accepted: false });
    expect(vehicleAcceptance('direct_appeal', { capital: true })).toMatchObject({ accepted: false });
    expect(vehicleAcceptance('direct_appeal', { capital: false })).toEqual({ accepted: true });
    expect(vehicleAcceptance('11.07', {})).toEqual({ accepted: true });
    for (const id of VEHICLE_IDS) expect(vehicleAcceptance(id, { capital: true }).accepted).toBe(false);
  });

  it('weights the screens the analysis actually runs', () => {
    const known = new Set(['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification', 'plea_lane']);
    for (const id of VEHICLE_IDS) for (const s of VEHICLES[id].weightedScreens) expect(known.has(s)).toBe(true);
    expect(VEHICLES.direct_appeal.weightedScreens[0]).toBe('preserved_error');
    expect(VEHICLES['11.07'].weightedScreens).toContain('iac');
  });
});

describe('E4 — vector table', () => {
  it('every vector is proposed today and unsignedVectors() lists them all', () => {
    expect(TRAP_CHAIN.length).toBeGreaterThan(0);
    expect(TRAP_CHAIN.every((v) => v.confidence === 'proposed' && !v.signedBy)).toBe(true);
    expect(unsignedVectors().map((v) => v.id)).toEqual(TRAP_CHAIN.map((v) => v.id));
  });

  it('carries the rules the plan names, labelled jurisdictional or discretionary', () => {
    const rules = new Set(TRAP_CHAIN.map((v) => v.rule));
    for (const r of ['TRAP 26.2', 'TRAP 26.3', 'TRAP 35.2', 'TRAP 38.6', 'TRAP 49.1', 'TRAP 68.2', 'TRAP 73.4', 'TRAP 73.5']) {
      expect(rules.has(r as never)).toBe(true);
    }
    expect(vectorById('noa').jurisdictional).toBe(true);
    expect(vectorById('noa_ext').jurisdictional).toBe(true);
    expect(vectorById('record').jurisdictional).toBe(false);
    expect(vectorById('brief').jurisdictional).toBe(false);
    expect(vectorById('rehearing').jurisdictional).toBe(false);
    expect(vectorById('pdr').jurisdictional).toBe(true);
    expect(vectorById('noa').days).toBe(30);
    expect(vectorById('noa_mnt').days).toBe(90);
    expect(vectorById('noa_ext').days).toBe(15);
    expect(vectorById('brief').days).toBe(30);
    expect(vectorById('rehearing').days).toBe(15);
    expect(vectorById('pdr').days).toBe(30);
  });

  it('ids are unique and every vector has a note and a counting rule', () => {
    expect(new Set(TRAP_CHAIN.map((v) => v.id)).size).toBe(TRAP_CHAIN.length);
    expect(TRAP_CHAIN.every((v) => v.note.length > 10 && v.countingRule === 'calendar')).toBe(true);
    expect(DIRECT_APPEAL_CHAIN.every((v) => v.chain === 'direct_appeal')).toBe(true);
    expect(WRIT_11_07_CHAIN.every((v) => v.chain === '11.07')).toBe(true);
    expect(DIRECT_APPEAL_CHAIN.length + WRIT_11_07_CHAIN.length).toBe(TRAP_CHAIN.length);
  });
});

describe('Anders appendix data', () => {
  it('is a checklist with sources and screen ids the report can map findings onto', () => {
    expect(ANDERS_CHECKLIST.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ANDERS_CHECKLIST.map((i) => i.id)).size).toBe(ANDERS_CHECKLIST.length);
    for (const i of ANDERS_CHECKLIST) {
      expect(i.text.length).toBeGreaterThan(10);
      expect(i.source.length).toBeGreaterThan(3);
      expect(Array.isArray(i.screenIds)).toBe(true);
    }
    expect(andersItemsForScreen('voir_dire').map((i) => i.id)).toContain('jury_selection');
    expect(andersItemsForScreen('sentencing').length).toBeGreaterThan(0);
    // a process item with no screen behind it stays in the list — the appendix is a record of process
    expect(ANDERS_CHECKLIST.some((i) => i.screenIds.length === 0)).toBe(true);
    expect(ANDERS_CHECKLIST.every((i) => i.confidence === 'proposed' || i.confidence === 'signed')).toBe(true);
  });
});
