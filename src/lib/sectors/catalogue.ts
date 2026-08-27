/**
 * The sector catalogue.
 *
 * Seeded from this hand-verified table rather than discovered at runtime,
 * because the mapping from an NSE index name to a niftyindices.com file stem
 * cannot be derived — and a wrong stem returns HTTP 200 with an HTML page, so a
 * guess fails silently rather than loudly.
 *
 * Every `constituentsFile` here was fetched and confirmed to return a real CSV
 * header. Where a sectoral index has no verified file the field is null: the
 * sector still exists and still shows its index level, it just cannot list
 * constituents until a stem is found for it.
 */
export type SectorSeed = {
  key: string;
  name: string;
  displayName: string;
  constituentsFile: string | null;
  sortIndex: number;
};

export const SECTOR_CATALOGUE: readonly SectorSeed[] = [
  { key: "nifty-50", name: "NIFTY 50", displayName: "Nifty 50", constituentsFile: "ind_nifty50list", sortIndex: 5 },
  { key: "it", name: "NIFTY IT", displayName: "Information Technology", constituentsFile: "ind_niftyitlist", sortIndex: 10 },
  { key: "bank", name: "NIFTY BANK", displayName: "Banking", constituentsFile: "ind_niftybanklist", sortIndex: 20 },
  { key: "private-bank", name: "NIFTY PRIVATE BANK", displayName: "Private Banks", constituentsFile: "ind_nifty_privatebanklist", sortIndex: 30 },
  { key: "psu-bank", name: "NIFTY PSU BANK", displayName: "PSU Banks", constituentsFile: "ind_niftypsubanklist", sortIndex: 40 },
  { key: "financial-services", name: "NIFTY FINANCIAL SERVICES", displayName: "Financial Services", constituentsFile: "ind_niftyfinancelist", sortIndex: 50 },
  { key: "auto", name: "NIFTY AUTO", displayName: "Automobiles", constituentsFile: "ind_niftyautolist", sortIndex: 60 },
  { key: "pharma", name: "NIFTY PHARMA", displayName: "Pharmaceuticals", constituentsFile: "ind_niftypharmalist", sortIndex: 70 },
  { key: "healthcare", name: "NIFTY HEALTHCARE INDEX", displayName: "Healthcare", constituentsFile: "ind_niftyhealthcarelist", sortIndex: 80 },
  { key: "fmcg", name: "NIFTY FMCG", displayName: "FMCG", constituentsFile: "ind_niftyfmcglist", sortIndex: 90 },
  { key: "metal", name: "NIFTY METAL", displayName: "Metals", constituentsFile: "ind_niftymetallist", sortIndex: 100 },
  { key: "oil-gas", name: "NIFTY OIL & GAS", displayName: "Oil & Gas", constituentsFile: "ind_niftyoilgaslist", sortIndex: 110 },
  { key: "energy", name: "NIFTY ENERGY", displayName: "Energy", constituentsFile: "ind_niftyenergylist", sortIndex: 120 },
  { key: "realty", name: "NIFTY REALTY", displayName: "Realty", constituentsFile: "ind_niftyrealtylist", sortIndex: 130 },
  { key: "media", name: "NIFTY MEDIA", displayName: "Media", constituentsFile: "ind_niftymedialist", sortIndex: 140 },
  { key: "consumer-durables", name: "NIFTY CONSUMER DURABLES", displayName: "Consumer Durables", constituentsFile: "ind_niftyconsumerdurableslist", sortIndex: 150 },
];

export function sectorByName(name: string): SectorSeed | undefined {
  return SECTOR_CATALOGUE.find((sector) => sector.name === name);
}

export function sectorByKey(key: string): SectorSeed | undefined {
  return SECTOR_CATALOGUE.find((sector) => sector.key === key);
}
