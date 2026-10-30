// Alle Prozentwerte werden als Prozentzahl gespeichert (10 = 10 %), Beträge in Euro.

export type RegionCode =
  | 'AN' | 'AR' | 'AS' | 'IB' | 'CN' | 'CB' | 'CM' | 'CL' | 'CT'
  | 'VC' | 'EX' | 'GA' | 'MD' | 'MC' | 'NC' | 'PV' | 'RI' | 'CE' | 'ML';

export type PropertyType = 'used' | 'new';
export type Repayment = 'annuity' | 'linear' | 'bullet';
export type RateType = 'fixed' | 'variable' | 'mixed';
export type ScenarioKey = 'pessimistic' | 'realistic' | 'optimistic';

export interface LineItem {
  id: string;
  label: string;
  amount: number;
}

export interface LaterInvestment extends LineItem {
  year: number;
}

export interface PurchaseInputs {
  price: number;
  propertyType: PropertyType;
  region: RegionCode;
  itpPct: number;
  ivaPct: number;
  ajdPct: number;
  costMode: 'quick' | 'detail';
  /** Schnellmodus: alle Kaufnebenkosten inkl. Steuern in % vom Kaufpreis */
  quickCostsPct: number;
  notary: number;
  gestoria: number;
  lawyer: number;
  valuation: number;
  bankFees: number;
  buyerAgent: number;
  lifeInsurance: number;
  other: number;
}

export interface FinancingInputs {
  enabled: boolean;
  amountMode: 'eur' | 'pct';
  amount: number;
  /** % vom Kaufpreis */
  amountPct: number;
  repayment: Repayment;
  termMode: 'years' | 'target';
  termYears: number;
  targetPct: number;
  targetYears: number;
  rateType: RateType;
  fixedRatePct: number;
  /** nur bei gemischtem Zins */
  fixedYears: number;
  marginPct: number;
  euriborMode: 'constant' | 'path';
  euriborPct: number;
  /** Euríbor je Jahr (Index 0 = Jahr 1); fehlende Jahre übernehmen den letzten Wert */
  euriborPath: number[];
  prepaymentPenaltyPct: number;
}

export interface RentalInputs {
  /** false = nicht vermieten: keine Miete, keine Mietsteuer; feste Eigentümerkosten laufen weiter */
  enabled: boolean;
  /** Monate ohne Miete zu Beginn (Renovierung, Mietersuche) */
  startDelayMonths: number;
  monthlyRent: number;
  /** optionale manuelle Monatsmiete je Jahr (Index 0 = Jahr 1) */
  manualRent: (number | null)[];
  vacancyMode: 'pct' | 'months';
  vacancyPct: number;
  vacancyMonths: number;
  managementPct: number;
  maintenancePct: number;
  communityMonthly: number;
  ibi: number;
  waste: number;
  insurance: number;
  reserve: number;
  nonRecoverable: number;
  taxAdvice: number;
  other: number;
  growthMode: 'single' | 'separate';
  growthPct: number;
  rentGrowthPct: number;
  costGrowthPct: number;
}

export interface TaxInputs {
  rentalTaxEnabled: boolean;
  /** durchschnittlicher persönlicher IRPF-Satz auf die Mieteinkünfte */
  rentalTaxPct: number;
  /** Reducción auf positive Mieteinkünfte (Wohnraummiete), 0 = keine */
  rentalReductionPct: number;
  /** Bodenanteil in %, wenn keine Katasterwerte eingegeben sind */
  landPct: number;
  /** Valor catastral del suelo / de la construcción laut IBI-Bescheid (0 = nicht angegeben) */
  cadastralLand: number;
  cadastralBuilding: number;
  nonResident: boolean;
}

export interface Scenario {
  growthPct: number;
  price: number;
}

export interface SaleInputs {
  holdYears: number;
  priceMode: 'direct' | 'growth';
  scenarios: Record<ScenarioKey, Scenario>;
  agentPct: number;
  lawyer: number;
  plusvalia: number;
  preparation: number;
  openCommunity: number;
  other: number;
}

export interface RentOnlyInputs {
  /** null = Kreditlaufzeit */
  horizonYears: number | null;
  valueGrowthPct: number;
}

export interface Inputs {
  purchase: PurchaseInputs;
  renovation: { items: LineItem[]; later: LaterInvestment[] };
  financing: FinancingInputs;
  rental: RentalInputs;
  tax: TaxInputs;
  sale: SaleInputs;
  rentOnly: RentOnlyInputs;
  excelLogic: boolean;
}
