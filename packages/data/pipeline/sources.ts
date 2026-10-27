export interface Source {
  id: string;
  url: string;
  license: string;
  attribution: string;
  binary?: boolean;
}

export const WDI_API = 'https://api.worldbank.org/v2';

export const SOURCES = {
  naturalEarth: {
    id: 'natural-earth-50m-admin0',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    license: 'Public domain',
    attribution: 'Made with Natural Earth (naturalearthdata.com)',
  },
  wpp: {
    id: 'un-wpp-2024-total-population',
    url: 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz',
    license: 'CC BY 3.0 IGO',
    attribution: 'United Nations, DESA, Population Division. World Population Prospects 2024',
    binary: true,
  },
  wdi: {
    id: 'world-bank-wdi',
    url: WDI_API,
    license: 'CC BY 4.0',
    attribution: 'World Bank, World Development Indicators',
  },
  owid: {
    id: 'owid-grapher',
    url: 'https://ourworldindata.org/grapher',
    license: 'CC BY 4.0 (data: V-Dem Institute v15; Barro & Lee; processed by Our World in Data)',
    attribution: 'Our World in Data; V-Dem Institute; Barro & Lee',
  },
} satisfies Record<string, Source>;

export function wdiUrl(code: string, page: number): string {
  return `${WDI_API}/country/all/indicator/${code}?format=json&per_page=20000&page=${page}&date=1960:2030`;
}

export function owidUrl(slug: string): string {
  return `${SOURCES.owid.url}/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`;
}
