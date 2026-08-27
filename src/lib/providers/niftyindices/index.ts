import { politeFetch } from "../http";

import { parseConstituents, type Constituent } from "./parse-constituents";

export async function fetchConstituents(file: string): Promise<Constituent[]> {
  const url = `https://www.niftyindices.com/IndexConstituent/${file}.csv`;
  const response = await politeFetch(url, {
    source: "NIFTY_CONSTITUENTS",
    accept: "text/csv,text/plain,*/*",
  });
  return parseConstituents(response.text, file);
}
