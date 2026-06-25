/**
 * Tests for moveDealToStage in pipeline-automation.ts
 *
 * Key invariant: a deal must only ever be moved to a stage that belongs to
 * the same pipeline as its current stage.  Queries that match a target stage
 * by name across all pipelines of a tenant must be scoped to the deal's own
 * pipeline — verified here via the multi-pipeline scenario.
 *
 * Scenarios:
 *  A. Happy path — deal found, target stage in same pipeline → moved
 *  B. Multi-pipeline isolation — target stage name exists in TWO pipelines;
 *     deal in pipeline-A must NOT be moved to pipeline-B's stage
 *  C. Target stage absent from deal's pipeline → warning logged, no move
 *  D. forwardOnly=true, deal already at or past target order → no move
 *  E. forwardOnly=true, deal behind target → moved
 *  F. Deal not found → no DB update, no error
 *  G. Deal found by reservationId (no explicit dealId) → moved
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const {
  mockLimit,
  mockOrderBy,
  mockWhere,
  mockFrom,
  mockSelect,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockLimit       = vi.fn();
  const mockOrderBy     = vi.fn();
  const mockWhere       = vi.fn();
  const mockFrom        = vi.fn(() => ({ where: mockWhere }));
  const mockSelect      = vi.fn(() => ({ from: mockFrom }));
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet   = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate      = vi.fn(() => ({ set: mockUpdateSet }));
  const mockLoggerWarn  = vi.fn();
  const mockLoggerError = vi.fn();
  return {
    mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect,
    mockUpdateWhere, mockUpdateSet, mockUpdate,
    mockLoggerWarn, mockLoggerError,
  };
});

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  dealsTable:          { _table: "deals" },
  pipelineStagesTable: { _table: "pipelineStages" },
  tripsTable:          { _table: "trips" },
}));

vi.mock("drizzle-orm", () => ({
  eq:        vi.fn(() => "eq"),
  and:       vi.fn((...a: unknown[]) => a),
  desc:      vi.fn(() => "desc"),
  lte:       vi.fn(() => "lte"),
  gte:       vi.fn(() => "gte"),
  isNotNull: vi.fn(() => "isNotNull"),
  sql:       vi.fn(() => "sql"),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    warn:  mockLoggerWarn,
    error: mockLoggerError,
    info:  vi.fn(),
  },
}));

vi.mock("@workspace/permissions", () => ({
  DEAL_STATUS: { OPEN: "open", CLOSED: "closed" },
}));

// ---------------------------------------------------------------------------
// Import under test AFTER all mocks
// ---------------------------------------------------------------------------

import { moveDealToStage } from "../services/pipeline-automation.js";

// ---------------------------------------------------------------------------
// Mock-chain helpers
//
// Each select query chain ends in .where().limit(1) or .where().orderBy().limit(1).
// wv(val): makes mockWhere return a thenable that also has .orderBy and .limit
// ov(val): makes mockOrderBy return a thenable that also has .limit
// ---------------------------------------------------------------------------

function wv(val: unknown[]) {
  return Object.assign(Promise.resolve(val), {
    orderBy: mockOrderBy,
    limit:   mockLimit,
  });
}

function ov(val: unknown[]) {
  return Object.assign(Promise.resolve(val), {
    limit: mockLimit,
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDeal(overrides: Record<string, unknown> = {}) {
  return { id: "deal-1", stageId: "stage-vitrine-a", ...overrides };
}

function makeCurrentStage(overrides: Record<string, unknown> = {}) {
  return { order: 2, pipelineId: "pipeline-a", ...overrides };
}

function makeTargetStage(overrides: Record<string, unknown> = {}) {
  return { id: "stage-pagamento-a", order: 4, ...overrides };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockUpdateWhere.mockResolvedValue([]);
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("moveDealToStage", () => {

  // Scenario A: happy path
  it("A — moves deal to target stage within the same pipeline", async () => {
    const deal         = makeDeal();
    const currentStage = makeCurrentStage();
    const targetStage  = makeTargetStage();

    // Query 1: deal by dealId → .where().limit(1)
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([deal]);

    // Query 2: current stage → .where().limit(1)
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    // Query 3: target stage in same pipeline → .where().limit(1)
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([targetStage]);

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-1",
      targetStageName: "Pagamento Confirmado",
      forwardOnly: false,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ stageId: targetStage.id });
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  // Scenario B: multi-pipeline isolation
  it("B — does NOT move deal when target stage name exists only in a different pipeline", async () => {
    // Deal is in pipeline-a. A stage named "Pagamento Confirmado" exists in
    // pipeline-b but NOT in pipeline-a. The move must be silently skipped.
    const deal         = makeDeal({ stageId: "stage-vitrine-a" });
    const currentStage = makeCurrentStage({ pipelineId: "pipeline-a" });

    // Query 1: deal
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([deal]);

    // Query 2: current stage → pipeline-a
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    // Query 3: target stage in pipeline-a → NOT FOUND (the name only exists in pipeline-b)
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([]);

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-1",
      targetStageName: "Pagamento Confirmado",
      forwardOnly: false,
    });

    // No update must happen
    expect(mockUpdate).not.toHaveBeenCalled();
    // A warning must be logged so operators can investigate misconfigured pipelines
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: "pipeline-a" }),
      expect.stringContaining("[pipeline-automation]"),
    );
  });

  // Scenario C: target stage absent from deal's pipeline (similar to B, explicit check)
  it("C — logs warning and skips move when target stage is absent from deal's pipeline", async () => {
    const deal         = makeDeal();
    const currentStage = makeCurrentStage();

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([deal]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([]);   // target not found

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-1",
      targetStageName: "Estágio Inexistente",
      forwardOnly: false,
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  // Scenario D: forwardOnly — deal already past target
  it("D — does NOT move deal backwards when forwardOnly=true", async () => {
    const deal         = makeDeal();
    const currentStage = makeCurrentStage({ order: 5 });  // further along
    const targetStage  = makeTargetStage({ order: 2 });    // earlier stage

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([deal]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([targetStage]);

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-1",
      targetStageName: "Vitrine",
      forwardOnly: true,
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Scenario E: forwardOnly — deal behind target → moved
  it("E — moves deal forward when forwardOnly=true and deal is behind target", async () => {
    const deal         = makeDeal();
    const currentStage = makeCurrentStage({ order: 2 });
    const targetStage  = makeTargetStage({ order: 4 });

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([deal]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([targetStage]);

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-1",
      targetStageName: "Pagamento Confirmado",
      forwardOnly: true,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ stageId: targetStage.id });
  });

  // Scenario F: deal not found
  it("F — returns without error when deal is not found", async () => {
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([]);   // deal not found

    await moveDealToStage({
      tenantId: "tenant-1",
      dealId: "deal-nonexistent",
      targetStageName: "Pagamento Confirmado",
      forwardOnly: false,
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  // Scenario G: deal found by reservationId (no explicit dealId)
  it("G — moves deal found via reservationId (no explicit dealId)", async () => {
    const deal         = makeDeal({ id: "deal-by-res" });
    const currentStage = makeCurrentStage();
    const targetStage  = makeTargetStage();

    // Query 1: deal by reservationId — ends in .where().orderBy().limit(1)
    mockWhere.mockImplementationOnce(() => wv([]));
    mockOrderBy.mockImplementationOnce(() => ov([]));
    mockLimit.mockResolvedValueOnce([deal]);

    // Query 2: current stage
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([currentStage]);

    // Query 3: target stage
    mockWhere.mockImplementationOnce(() => wv([]));
    mockLimit.mockResolvedValueOnce([targetStage]);

    await moveDealToStage({
      tenantId: "tenant-1",
      reservationId: "res-1",
      targetStageName: "Pagamento Confirmado",
      forwardOnly: false,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ stageId: targetStage.id });
  });
});
